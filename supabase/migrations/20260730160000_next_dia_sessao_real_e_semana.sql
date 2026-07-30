-- ============================================================================
-- Next - o DIA da inscricao de backfill: sessao real primeiro, semana depois
-- ============================================================================
-- Pedido do Marcos (2026-07-30): "nao quero mudar o KPI do next, quero que
-- altere o dia das inscricoes, ja que nao temos o dia certo - ao invés de usar
-- sempre o dia 1 e colocar todas la, divide pelas semanas do mes e separa as
-- inscricoes, ai vamos poder comparar o dado atual com o dado da semana do ano
-- passado."
--
-- Antes de estimar, MEDI: a premissa "nao temos o dia certo" so vale pra 31%.
-- As 56 listas digitalizadas do Next TEM data de sessao (56 datas distintas,
-- espalhadas do dia 1 ao 27 - sao encontros semanais). Cruzando
-- next_inscricoes x next_eventos, 1.109 das 1.604 matriculas de backfill (69%)
-- tem a data REAL da 1a sessao em que a pessoa apareceu naquele mes.
--
-- Entao a regua tem 3 niveis, do mais verdadeiro pro menos:
--
--   1. Matricula registrada DURANTE (ou antes de) a propria turma -> created_at.
--      E o dado novo e preciso; nao se toca. Igual a 20260730130000.
--   2. Backfill COM aparicao -> data REAL da 1a sessao do mes. NAO e estimativa:
--      o dia existia no PDF e nao estava sendo lido. 1.109 linhas.
--   3. Backfill SEM nenhuma aparicao -> ai o dia e desconhecido de verdade.
--      Espalha pelas 4 semanas (dias 1/8/15/22), deterministico pelo id da
--      matricula. 495 linhas. E ESTIMATIVA, e esta declarada como tal.
--
-- Por que 1/8/15/22 e nao uma data de sessao plausivel: o padrao de 7 em 7 a
-- partir do dia 1o e visivelmente sintetico. Quem olhar o grafico e vir volume
-- no dia 8 de um mes sem encontro no dia 8 sabe que aquilo e aproximacao.
-- Escolher "2025-04-13 porque teve sessao nesse dia" seria fingir precisao que
-- nao existe - o oposto do que a regua do legado manda.
--
-- ATENCAO: o `created_at` de next_matriculas fica INTACTO (segue respondendo
-- "esta linha entrou no sistema em 13/05 pelo import X"). Muda a LEITURA.
-- ATENCAO: NAO mexe em KPI. Os 3 indicadores do Next (NEXT-01/02/03) continuam
-- ativo=false medindo indicou_*, e os coletores continuam janelando por
-- created_at. Decisao do Marcos nesta conversa.
--
-- Idempotente. Nenhuma linha de dado e reescrita.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A 1a sessao de cada pessoa em cada mes (o dia real que estava no PDF)
-- ----------------------------------------------------------------------------
-- View e nao coluna materializada de proposito: dado derivado de presenca nao
-- pode ficar velho. Se uma presenca for corrigida, a data acompanha sozinha.
-- next_inscricoes NAO tem deleted_at (conferido no banco) - nada a filtrar.
CREATE OR REPLACE VIEW public.vw_next_primeira_sessao_mes AS
SELECT i.membro_id,
       to_char(e.data, 'YYYY-MM') AS mes,
       min(e.data)                AS primeira_sessao
  FROM public.next_inscricoes i
  JOIN public.next_eventos e ON e.id = i.evento_id
 WHERE i.membro_id IS NOT NULL
 GROUP BY i.membro_id, to_char(e.data, 'YYYY-MM');

COMMENT ON VIEW public.vw_next_primeira_sessao_mes IS
  'Dia REAL da 1a sessao em que cada pessoa apareceu em cada mes (next_inscricoes x next_eventos.data). Base do nivel 2 de fn_next_data_fato: o backfill das 56 listas de presenca tem a data da sessao, so nao estava sendo lida.';

-- ----------------------------------------------------------------------------
-- 2. Fonte UNICA da data do fato do Next
-- ----------------------------------------------------------------------------
-- A regua fica num lugar so: quando a frente de KPI voltar, ela chama esta
-- funcao em vez de reimplementar a regra em JS.
CREATE OR REPLACE FUNCTION public.fn_next_data_fato(
  p_created_at      timestamptz,
  p_origem_mes      text,
  p_primeira_sessao date,
  p_id              uuid
) RETURNS timestamptz
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE
    -- Nivel 1 - dado novo manda. Turma sem mes ('hist-checkin') cai aqui tambem.
    WHEN p_origem_mes IS NULL
      OR p_origem_mes !~ '^[0-9]{4}-[0-9]{2}$'
      OR to_char(p_created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') <= p_origem_mes
      THEN p_created_at

    -- Nivel 2 - data REAL da sessao (nao e estimativa).
    WHEN p_primeira_sessao IS NOT NULL
      THEN (p_primeira_sessao + time '12:00') AT TIME ZONE 'America/Sao_Paulo'

    -- Nivel 3 - dia desconhecido: 4 semanas, deterministico pelo id.
    -- `(h % 4 + 4) % 4` e nao `abs(h) % 4`: hashtext pode devolver INT_MIN e
    -- abs(INT_MIN) estoura com 22003 - a leitura da linha inteira falharia.
    ELSE ((((p_origem_mes || '-01')::date
             + (7 * ((hashtext(p_id::text) % 4 + 4) % 4)) * interval '1 day')::date
           + time '12:00') AT TIME ZONE 'America/Sao_Paulo')
  END
$fn$;

COMMENT ON FUNCTION public.fn_next_data_fato(timestamptz, text, date, uuid) IS
  'Data do FATO de uma matricula do Next, em 3 niveis: (1) registrada durante a propria turma -> created_at real; (2) backfill com aparicao -> dia REAL da 1a sessao do mes (vw_next_primeira_sessao_mes); (3) backfill sem aparicao -> dia 1/8/15/22 pelo hash do id (ESTIMATIVA declarada, espalha pelas semanas pra comparacao semanal YoY fazer sentido). Nunca reescreve created_at.';

-- ----------------------------------------------------------------------------
-- 3. A view unificada passa a usar a funcao (so o ramo do Next mudou)
-- ----------------------------------------------------------------------------
-- Reconstruida a partir da 20260730130000 por substituicao textual dos 2
-- trechos do ramo do Next (expressao da data + JOIN), nao por transcricao
-- manual - transcrever 258 linhas de UNION ALL a mao e onde nasce erro.
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
  public.fn_next_data_fato(m.created_at, t.origem_mes, ps.primeira_sessao, m.id),
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
LEFT JOIN public.vw_next_primeira_sessao_mes ps
       ON ps.membro_id = m.membro_id AND ps.mes = t.origem_mes
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
  'Leitura unificada das 9 portas de inscricao (F1 5-6 + SPEC-03/SPEC-10). Status canonico: recebida->em_tratamento->confirmada->concluida|nao_concluida|recusada|cancelada. ATENCAO: criado_em = DATA DO FATO, nao a data em que a linha entrou no banco: batismo usa data_batismo, voluntariado usa data_inscricao, next usa fn_next_data_fato (sessao real onde existe, senao estimativa espalhada por semana). As demais portas nunca tiveram import em massa, entao o created_at delas ja E o momento real. O carimbo tecnico continua no created_at de cada tabela de origem. Series derivadas (tempo 1 do SPEC-10) so pra analytics. next_inscricoes NAO e porta: e presenca por encontro. Acesso exclusivo via backend.';

-- ----------------------------------------------------------------------------
-- Conferencia (rodar depois de aplicar)
-- ----------------------------------------------------------------------------
-- 1) O dia 1o deixa de concentrar ~1.614 linhas do next; o volume passa a
--    aparecer nas datas reais de sessao (5, 12, 19, 26...) + nas ancoras
--    1/8/15/22 dos 495 sem aparicao.
--   SELECT extract(day from criado_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
--          count(*) AS n
--     FROM public.vw_inscricoes_unificadas WHERE porta = 'next'
--    GROUP BY 1 ORDER BY 1;
--
-- 2) Nenhuma linha no futuro:
--   SELECT count(*) FROM public.vw_inscricoes_unificadas
--    WHERE porta = 'next' AND criado_em > now();
--
-- 3) Quanto de cada nivel (auditoria de quanto do numero e estimativa):
--   SELECT count(*) FILTER (WHERE ps.primeira_sessao IS NOT NULL) AS nivel_2_real,
--          count(*) FILTER (WHERE ps.primeira_sessao IS NULL)     AS nivel_3_estimado
--     FROM public.next_matriculas m
--     JOIN public.next_turmas t ON t.id = m.turma_id
--     LEFT JOIN public.vw_next_primeira_sessao_mes ps
--            ON ps.membro_id = m.membro_id AND ps.mes = t.origem_mes
--    WHERE m.deleted_at IS NULL AND t.origem_mes ~ '^[0-9]{4}-[0-9]{2}$'
--      AND to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') > t.origem_mes;
