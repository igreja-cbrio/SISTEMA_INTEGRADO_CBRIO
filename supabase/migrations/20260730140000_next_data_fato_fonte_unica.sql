-- ============================================================================
-- Next · a data do fato vira FONTE ÚNICA, e os 3 KPIs param de usar a data de
-- import (2026-07-29)
--
-- CONTEXTO: a 20260730130000 fez a view unificada mostrar a DATA DO FATO, mas os
-- coletores next.batismos / next.voluntarios / next.dizimo continuaram janelando
-- por next_matriculas.created_at. Ou seja: o gráfico do módulo e o KPI
-- discordariam da mesma realidade — dois lugares com regras diferentes pro mesmo
-- conceito, que é exatamente o padrão que estamos desfazendo.
--
-- ⚠️ ESTADO REAL dos 3 indicadores (conferido no banco ANTES de escrever):
-- NEXT-01/02/03 estão ativo = false, e coletarTodos filtra .eq('ativo', true) —
-- então eles NÃO estão sendo coletados. Os 6 registros guardados são de 2026-04
-- e 2026-05, todos 0, e o de 2026-05 diz "Nenhum inscrito no período" (a coleta
-- rodou ANTES do import de 13/05). Portanto o número falso NUNCA foi gravado: o
-- risco é LATENTE — reativar o KPI sem esta correção produziria maio/2026
-- calculado sobre 1.109 linhas de roster de 2024/2025. Isto é seguro, não
-- conserto de incêndio.
--
-- O QUE MUDA:
--   1. fn_next_data_fato(created_at, origem_mes) — a regra passa a existir em UM
--      lugar só. Mês da turma quando a linha foi registrada DEPOIS do mês dela
--      (= backfill); senão o created_at, que é preciso.
--   2. vw_next_matriculas_kpi — matrícula + data_fato, sem PII, pros coletores
--      filtrarem por data de negócio sem reimplementar nada.
--   3. A view unificada troca o CASE inline pela função (mesmo resultado, uma
--      definição).
--
-- Reversível: CREATE OR REPLACE nos três objetos.
-- ============================================================================

SET lock_timeout = '10s';

-- ── 1. A REGRA, em um lugar só ──────────────────────────────────────────────
-- IMMUTABLE de verdade: "ts AT TIME ZONE '<literal>'" e to_char(timestamp,...)
-- não dependem do GUC TimeZone da sessão (o AT TIME ZONE com zona literal já
-- resolveu o fuso antes do to_char). Meio-dia BRT ao converter DATE->timestamptz
-- porque ::timestamptz puro daria meia-noite UTC = 21h do dia ANTERIOR aqui.
CREATE OR REPLACE FUNCTION public.fn_next_data_fato(
  p_created_at TIMESTAMPTZ,
  p_origem_mes TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_origem_mes ~ '^[0-9]{4}-[0-9]{2}$'
     AND to_char(p_created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') > p_origem_mes
    THEN ((p_origem_mes || '-01')::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo'
    ELSE p_created_at
  END
$$;

COMMENT ON FUNCTION public.fn_next_data_fato(TIMESTAMPTZ, TEXT) IS
  'Data do FATO de uma matrícula do Next: mês da turma (dia 1º, meio-dia BRT) quando a linha foi registrada depois do mês dela (backfill das 56 listas de papel), senão o created_at. Fonte ÚNICA da regra — consumida por vw_inscricoes_unificadas e por vw_next_matriculas_kpi. Não duplicar em JS.';

-- ── 2. A view que os coletores de KPI leem ──────────────────────────────────
-- Só o que o KPI precisa: ZERO PII (sem nome, cpf, e-mail, telefone). Expõe as
-- DUAS datas — data_fato pra medir e registrado_em pra auditar.
CREATE OR REPLACE VIEW public.vw_next_matriculas_kpi AS
SELECT
  m.id,
  m.turma_id,
  t.origem_mes,
  public.fn_next_data_fato(m.created_at, t.origem_mes) AS data_fato,
  m.created_at AS registrado_em,
  m.status,
  m.origem,
  m.ja_batizado,
  m.ja_voluntario,
  m.ja_doador,
  m.indicou_batismo,
  m.indicou_servir,
  m.indicou_grupo,
  m.indicou_dizimo,
  m.check_in_at,
  m.deleted_at
FROM public.next_matriculas m
LEFT JOIN public.next_turmas t ON t.id = m.turma_id;

REVOKE ALL ON public.vw_next_matriculas_kpi FROM anon, authenticated;

COMMENT ON VIEW public.vw_next_matriculas_kpi IS
  'Matrículas do Next com a DATA DO FATO resolvida (fn_next_data_fato) pros coletores de KPI janelarem por data de negócio em vez da data de import. Sem PII. registrado_em = o created_at técnico, preservado.';

-- ── 3. A view unificada passa a chamar a função (uma definição) ─────────────
CREATE OR REPLACE VIEW public.vw_inscricoes_unificadas AS
-- ── 1. ESPINHA (inscricoes × insc_eventos × insc_series) ──
SELECT
  'inscricoes'::text AS porta,
  i.id AS ref_id,
  '/inscricoes/evento/' || e.id AS rota_detalhe,
  i.membro_id,
  i.nome_completo AS nome_display,
  NULLIF(regexp_replace(coalesce(i.telefone, ''), '\D', '', 'g'), '') AS telefone_norm,
  NULLIF(regexp_replace(coalesce(i.cpf, ''), '\D', '', 'g'), '') AS cpf_norm,
  NULLIF(lower(trim(coalesce(i.email, ''))), '') AS email_norm,
  i.data_nascimento AS nascimento,
  i.created_at AS criado_em,
  i.status AS status_original,
  i.status AS status_canonico,            -- espinha já fala o vocabulário canônico
  coalesce(i.origem, 'formulario_publico') AS origem_norm,
  e.area AS area_display,
  e.nome AS evento_rotulo,
  s.slug_base AS serie_chave,
  e.edicao_rotulo,
  e.id::text AS evento_ref,
  e.data AS evento_data,
  CASE WHEN e.checkin_ativo THEN EXISTS (
    SELECT 1 FROM public.insc_checkins ck WHERE ck.inscricao_id = i.id
  ) ELSE NULL END AS compareceu
FROM public.inscricoes i
JOIN public.insc_eventos e ON e.id = i.evento_id
LEFT JOIN public.insc_series s ON s.id = e.serie_id
WHERE i.deleted_at IS NULL

UNION ALL
-- ── 2. EVENTOS EXTERNOS (redundante pós-virada · só linhas NÃO migradas) ──
SELECT
  'eventos_externos', x.id, '/inscricoes', x.membro_id,
  x.nome,
  NULLIF(regexp_replace(coalesce(x.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(x.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(x.email, ''))), ''),
  x.data_nascimento, x.created_at,
  x.status,
  CASE x.status WHEN 'cancelada' THEN 'cancelada' ELSE 'confirmada' END,
  coalesce(x.origem, 'formulario_publico'),
  'Sede', ee.nome, NULL, NULL, ee.id::text, ee.data, NULL::boolean
FROM public.ext_inscricoes x
JOIN public.ext_eventos ee ON ee.id = x.evento_id
WHERE x.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inscricoes i2
    WHERE i2.legado_fonte = 'ext_inscricoes' AND i2.legado_ref = x.id
  )

UNION ALL
-- ── 3. BATISMO (série derivada mensal · edição = mês do batismo) ──
SELECT
  'batismo', b.id, '/ministerial/integracao?tab=batismos', b.membro_id,
  trim(b.nome || ' ' || coalesce(b.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(b.email, ''))), ''),
  b.data_nascimento,
  -- DATA DO FATO (2026-07-29): a data do BATISMO, não a do import. 564 linhas
  -- entraram em 13/05/2026 pelo backfill com data_batismo de 2024-02 a 2026-05.
  -- Meio-dia em BRT de propósito: 'YYYY-MM-DD'::date::timestamptz cairia à
  -- meia-noite UTC = 21h do dia ANTERIOR no fuso da igreja.
  -- least(): a EVIDÊNCIA MAIS ANTIGA de que a linha existe. Batismo agendado
  -- tem data no FUTURO (há registro pra 23/08/2026) e ali quem manda é o
  -- created_at — inscrição não acontece depois da cerimônia. Nas 564 do
  -- backfill vale a cerimônia (2024/2025 < 13/05/2026). least() ignora NULL,
  -- então as 2 linhas sem data caem no created_at sozinhas.
  least((b.data_batismo + time '12:00') AT TIME ZONE 'America/Sao_Paulo', b.created_at),
  b.status,
  CASE b.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'confirmado' THEN 'confirmada'
    WHEN 'realizado' THEN 'concluida'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  coalesce(b.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(b.area_kpi), 'Sede'),
  'Batismo · ' || coalesce(to_char(b.data_batismo, 'DD/MM/YYYY'), 'a agendar'),
  'batismo-mensal', to_char(b.data_batismo, 'YYYY-MM'), NULL, b.data_batismo,
  CASE WHEN b.status IN ('realizado', 'confirmado') THEN (b.checkin_em IS NOT NULL OR b.status = 'realizado') ELSE NULL END
FROM public.batismo_inscricoes b
WHERE b.deleted_at IS NULL

UNION ALL
-- ── 4. APRESENTAÇÃO DE CRIANÇAS (form público · série derivada mensal) ──
SELECT
  'apresentacao_criancas', a.id, '/kids', a.responsavel_membro_id,
  a.crianca_nome,
  NULLIF(regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(a.cpf_responsavel, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(a.email, ''))), ''),
  a.crianca_data_nascimento, a.created_at,
  a.status,
  CASE a.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'confirmado' THEN 'confirmada'
    WHEN 'realizado' THEN 'concluida'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  CASE coalesce(a.origem, '') WHEN 'publico' THEN 'formulario_publico' WHEN '' THEN 'formulario_publico' ELSE a.origem END,
  'KIDS',
  'Apresentação · ' || coalesce(to_char(a.data_apresentacao, 'DD/MM/YYYY'), 'a agendar'),
  'apresentacao-mensal', to_char(a.data_apresentacao, 'YYYY-MM'), NULL, a.data_apresentacao,
  CASE WHEN a.status = 'realizado' THEN true ELSE NULL END
FROM public.apresentacao_criancas a
WHERE a.deleted_at IS NULL

UNION ALL
-- ── 5. APRESENTAÇÃO DE BEBÊS (porta viva do totem · mesma série derivada) ──
SELECT
  'apresentacao_bebes', ab.id, '/kids', ab.responsavel_membro_id,
  ab.bebe_nome,
  NULLIF(regexp_replace(coalesce(ab.responsavel_telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(ab.responsavel_email, ''))), ''),
  ab.bebe_data_nascimento, ab.created_at,
  ab.status,
  CASE ab.status
    WHEN 'agendada' THEN 'confirmada'
    WHEN 'confirmada' THEN 'confirmada'
    WHEN 'realizada' THEN 'concluida'
    WHEN 'cancelada' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  'formulario_publico',
  'KIDS',
  'Apresentação (bebê) · ' || coalesce(to_char(ab.data_apresentacao, 'DD/MM/YYYY'), 'a agendar'),
  'apresentacao-mensal', to_char(ab.data_apresentacao, 'YYYY-MM'), NULL, ab.data_apresentacao,
  CASE WHEN ab.status = 'realizada' THEN true ELSE NULL END
FROM public.apresentacao_bebes ab
WHERE ab.deleted_at IS NULL

UNION ALL
-- ── 6. GRUPOS (pedidos · série derivada = temporada do grupo) ──
SELECT
  'grupos', p.id, '/grupos?tab=entrada', p.membro_id,
  p.nome,
  NULLIF(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(p.email, ''))), ''),
  NULL::date, p.created_at,
  p.status,
  CASE p.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'devolvido' THEN 'em_tratamento'
    WHEN 'encaminhado' THEN 'em_tratamento'
    WHEN 'aprovado' THEN 'concluida'
    WHEN 'rejeitado' THEN 'recusada'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'recebida'
  END,
  coalesce(p.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(g.area), 'Grupos'),
  'Grupo ' || coalesce(g.nome, '—'),
  'grupos-temporadas', g.temporada, g.id::text, NULL::date, NULL::boolean
FROM public.mem_grupo_pedidos p
LEFT JOIN public.mem_grupos g ON g.id = p.grupo_id
WHERE p.deleted_at IS NULL

UNION ALL
-- ── 7. LÍDERES E ANFITRIÕES ──
SELECT
  'grupos_lider', l.id, '/grupos?tab=entrada', l.membro_id,
  l.nome,
  NULLIF(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(l.email, ''))), ''),
  NULL::date, l.created_at,
  l.status,
  CASE l.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'aceito' THEN 'em_tratamento'
    WHEN 'vinculado' THEN 'concluida'
    WHEN 'recusado' THEN 'recusada'
    ELSE 'recebida'
  END,
  coalesce(l.origem, 'formulario_publico'),
  'Grupos', 'Líderes e anfitriões', NULL, NULL, NULL, NULL::date, NULL::boolean
FROM public.mem_lider_inscricoes l
WHERE l.deleted_at IS NULL

UNION ALL
-- ── 8. NEXT · matrículas (série derivada = turma) ──
SELECT
  'next', m.id, '/ministerial/integracao?tab=next', m.membro_id,
  trim(m.nome || ' ' || coalesce(m.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(m.email, ''))), ''),
  m.data_nascimento,
  -- DATA DO FATO (2026-07-29): o mês da TURMA. 1.109 linhas entraram em
  -- 13/05/2026 (+426 em 30/06, +99 em 20/07, +88 em 21/07) pelo backfill das 56
  -- listas de presença — e a lista de papel não registrava o DIA, só o mês.
  -- Convenção: dia 1º do mês. Tudo cair no dia 1º é visivelmente uma
  -- aproximação mensal; inventar um dia plausível seria fingir precisão.
  -- Turma sem mês ('hist-checkin', turma nova sem origem_mes) cai no created_at.
  -- O mês da turma SÓ vale quando a linha foi registrada DEPOIS do mês dela
  -- (= backfill). Matrícula feita durante a própria turma tem created_at
  -- preciso e ele manda — senão eu estragaria a precisão do dado novo, que é
  -- justamente o que tem que ficar certo daqui pra frente.
  public.fn_next_data_fato(m.created_at, t.origem_mes),
  m.status,
  CASE
    WHEN m.status = 'matriculado' AND m.turma_id IS NULL THEN 'recebida'
    WHEN m.status = 'matriculado' THEN 'confirmada'
    WHEN m.status = 'formado' THEN 'concluida'
    WHEN m.status = 'incompleto' THEN 'nao_concluida'
    WHEN m.status = 'desistiu' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  coalesce(m.origem, 'formulario_publico'),
  'Next',
  'Next · ' || coalesce(t.nome, 'sem turma'),
  'next-turmas', coalesce(t.origem_mes, t.nome), t.id::text, NULL::date,
  (m.check_in_at IS NOT NULL)
FROM public.next_matriculas m
LEFT JOIN public.next_turmas t ON t.id = m.turma_id
WHERE m.deleted_at IS NULL

UNION ALL
-- ── 10. VOLUNTARIADO ──
SELECT
  'voluntariado', v.id, '/ministerial/voluntariado/inscricoes', v.membro_id,
  coalesce(NULLIF(trim(coalesce(v.nome_completo, '')), ''), trim(coalesce(v.nome, '') || ' ' || coalesce(v.sobrenome, ''))),
  NULLIF(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(v.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(v.email, ''))), ''),
  v.data_nascimento,
  -- DATA DO FATO (2026-07-29): `data_inscricao`, que estava preenchida em
  -- 749/749 das linhas importadas em 13/05/2026 com a data VERDADEIRA (2024-04,
  -- 2026-03…). Este ramo lia o created_at do import; era leitura de coluna
  -- errada, não falta de dado. Precisão de DIA.
  coalesce(v.data_inscricao, v.created_at),
  v.status,
  CASE v.status
    WHEN 'inscrito' THEN 'recebida'
    WHEN 'enviado_ministerio' THEN 'em_tratamento'
    WHEN 'kids' THEN 'em_tratamento'
    WHEN 'integrado' THEN 'concluida'
    WHEN 'nao_responde' THEN 'nao_concluida'
    WHEN 'nao_pode_ou_duplicata' THEN 'recusada'
    ELSE 'recebida'
  END,
  coalesce(v.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(v.area), 'Voluntariado'),
  'Voluntariado', NULL, NULL, NULL, NULL::date, NULL::boolean
FROM public.vol_inscricoes v
WHERE v.deleted_at IS NULL;

-- Acesso SÓ via backend (F1 M9): a view concentra PII de todas as portas.
REVOKE ALL ON public.vw_inscricoes_unificadas FROM anon, authenticated;

COMMENT ON VIEW public.vw_inscricoes_unificadas IS
  'Leitura unificada das 9 portas de inscrição (F1 §5-6 + SPEC-03/SPEC-10). Status canônico: recebida→em_tratamento→confirmada→concluida|nao_concluida|recusada|cancelada. ⚠️ criado_em = DATA DO FATO, não a data em que a linha entrou no banco (2026-07-29): batismo usa data_batismo, next usa o mês da turma no dia 1º, voluntariado usa data_inscricao. As demais portas nunca tiveram import em massa, então o created_at delas já É o momento real. O carimbo técnico continua no created_at de cada tabela de origem. Séries derivadas (tempo 1 do SPEC-10) só pra analytics. next_inscricoes NÃO é porta: é presença por encontro. Acesso exclusivo via backend.';

-- Conferência: a função tem que devolver o MESMO resultado que o CASE inline
-- devolvia (a 20260730130000 já foi validada em produção: 13/05 caiu de 2.422
-- pra 8 e 30/06 de 472 pra 29).
DO $$
DECLARE v_13mai INT; v_30jun INT; v_kpi INT; v_dif INT;
BEGIN
  SELECT count(*) INTO v_13mai FROM public.vw_inscricoes_unificadas
   WHERE criado_em >= '2026-05-13' AND criado_em < '2026-05-14';
  SELECT count(*) INTO v_30jun FROM public.vw_inscricoes_unificadas
   WHERE criado_em >= '2026-06-30' AND criado_em < '2026-07-01';
  SELECT count(*) INTO v_kpi FROM public.vw_next_matriculas_kpi WHERE deleted_at IS NULL;

  -- a data_fato da view nova tem que casar com o criado_em da unificada
  SELECT count(*) INTO v_dif
    FROM public.vw_next_matriculas_kpi k
    JOIN public.vw_inscricoes_unificadas v ON v.porta = 'next' AND v.ref_id = k.id
   WHERE k.deleted_at IS NULL AND k.data_fato <> v.criado_em;

  RAISE NOTICE '13/05/2026: % (esperado 8) · 30/06/2026: % (esperado 29)', v_13mai, v_30jun;
  RAISE NOTICE 'vw_next_matriculas_kpi: % matriculas vivas · divergencia de data com a unificada: % (esperado 0)', v_kpi, v_dif;
END $$;
