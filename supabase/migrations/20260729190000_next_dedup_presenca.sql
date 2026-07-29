-- ============================================================================
-- Next · fim da contagem dupla + presença na camada viva (2026-07-29)
--
-- DIAGNÓSTICO (medido em produção antes desta migration):
--   · o backfill de 13/05 (20260513160100) digitalizou 56 listas de presença
--     do Next e criou 1 linha em `next_inscricoes` por NOME POR LISTA
--     (soma dos total_lista = 2.443 ≈ 2.421 linhas criadas). Lista impressa é
--     ROSTER, não chamada: 76 nomes na folha × 34 presentes, no exemplo do
--     próprio arquivo. Por isso uma pessoa aparece até 17 vezes.
--   · no MESMO instante, o import agrupou essas aparições em
--     `next_matriculas` por (mês | membro) → 1.188 matrículas.
--   · a `vw_inscricoes_unificadas` somava as DUAS camadas sem dedup:
--     1.839 (next) + 2.423 (next_legado) = 4.262 de 5.911 linhas = 72% da view.
--     O ramo do `ext` já deduplicava por `legado_ref`; o do Next, não.
--   · a presença NÃO subiu pro novo modelo: 994 linhas legadas têm check-in,
--     contra 4 matrículas. O `compareceu` da porta `next` era ~sempre falso.
--
-- ESTA MIGRATION:
--   PARTE 1 · a view para de contar duas vezes (ramo 9 dedupa contra a
--             matrícula e colapsa aparições do mesmo mês).
--   PARTE 2 · sobe a presença do legado pra matrícula (~588 linhas).
--
-- ⚠️ NÃO apaga nem desliga `next_inscricoes`: as presenças reais moram lá e o
-- KPI `frequencia_next` lê de lá. As duas camadas carregam fatos DIFERENTES —
-- matrícula = inscrição/estado do mês · legado = aparição/presença por encontro.
-- ADITIVA e reversível: PARTE 1 é CREATE OR REPLACE VIEW (rollback = reaplicar
-- a 20260729050000) e PARTE 2 só preenche `check_in_at` NULO.
-- ============================================================================

SET lock_timeout = '10s';

-- ── PARTE 1 · view sem contagem dupla ───────────────────────────────────────
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
  b.data_nascimento, b.created_at,
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
  m.data_nascimento, m.created_at,
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
-- ── 9. NEXT · PRESENÇAS legadas SEM matrícula (2026-07-29) ──
-- ⚠️ Este ramo era a CONTAGEM DUPLA do módulo: o backfill de 13/05 criou 1
-- linha em next_inscricoes por NOME POR LISTA (56 listas digitalizadas · soma
-- dos total_lista = 2.443 ≈ as 2.421 linhas) e, no MESMO instante, agrupou
-- essas aparições em next_matriculas por (mês | membro). As duas camadas
-- descrevem o MESMO fato, e a view somava as duas → 4.262 de 5.911 linhas.
-- Agora o ramo só mostra o que NÃO tem contrapartida na matrícula, e no
-- máximo 1 linha por (mês × pessoa) — a aparição COM presença ganha
-- preferência no DISTINCT ON pra não perder o `compareceu`.
-- NÃO apagar a tabela legada: as presenças reais moram lá (994 linhas com
-- check-in, contra 4 nas matrículas antes do backfill desta migration) e o KPI
-- `frequencia_next` lê de lá.
SELECT
  'next_legado', n.id, '/ministerial/integracao?tab=next', n.membro_id,
  trim(n.nome || ' ' || coalesce(n.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(n.telefone, ''), 'D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(n.cpf, ''), 'D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(n.email, ''))), ''),
  n.data_nascimento, n.created_at,
  'legado',
  'confirmada',
  coalesce(n.origem, 'formulario_publico'),
  'Next', 'Next (legado)',
  -- Edição passa a existir (era NULL → chip "sem edição" que não abria nada):
  -- mês da lista, mesma série derivada do ramo 8.
  CASE WHEN n.mes_evento IS NULL THEN NULL ELSE 'next-turmas' END,
  n.mes_evento, NULL, n.data_evento, (n.check_in_at IS NOT NULL)
FROM (
  SELECT DISTINCT ON (to_char(e.data, 'YYYY-MM'), ni.membro_id)
         ni.*,
         to_char(e.data, 'YYYY-MM') AS mes_evento,
         e.data                     AS data_evento
    FROM public.next_inscricoes ni
    LEFT JOIN public.next_eventos e ON e.id = ni.evento_id
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.next_matriculas m
      WHERE m.deleted_at IS NULL
        AND m.origem_mes_key = to_char(e.data, 'YYYY-MM') || '|' || ni.membro_id::text
   )
   ORDER BY to_char(e.data, 'YYYY-MM'), ni.membro_id,
            (ni.check_in_at IS NULL), ni.check_in_at, ni.created_at, ni.id
) n
UNION ALL
-- ── 10. VOLUNTARIADO ──
SELECT
  'voluntariado', v.id, '/ministerial/voluntariado/inscricoes', v.membro_id,
  coalesce(NULLIF(trim(coalesce(v.nome_completo, '')), ''), trim(coalesce(v.nome, '') || ' ' || coalesce(v.sobrenome, ''))),
  NULLIF(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(v.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(v.email, ''))), ''),
  v.data_nascimento, v.created_at,
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
  'Leitura unificada das 10 portas de inscrição (F1 §5-6 + SPEC-03/SPEC-10). Status canônico: recebida→em_tratamento→confirmada→concluida|nao_concluida|recusada|cancelada. Séries derivadas (tempo 1 do SPEC-10) só pra analytics. ext_inscricoes = fonte redundante pós-virada (linhas migradas ficam de fora via legado_ref). Acesso exclusivo via backend.';

-- ── PARTE 2 · presença do legado → matrícula ────────────────────────────────
-- Regra: para cada (mês | membro), a PRIMEIRA presença registrada nas listas
-- daquele mês vira o check-in da matrícula correspondente. Só toca matrícula
-- com `check_in_at` NULO (o que já foi marcado no totem/app manda).
-- `next_matriculas` não tem trigger de KPI (o `tg_kpi_recalc_nativo` está em
-- `next_inscricoes`), então isto não dispara recálculo em cascata.
WITH presenca AS (
  SELECT DISTINCT ON (to_char(e.data, 'YYYY-MM') || '|' || ni.membro_id::text)
         to_char(e.data, 'YYYY-MM') || '|' || ni.membro_id::text AS chave,
         ni.check_in_at,
         ni.check_in_by
    FROM public.next_inscricoes ni
    JOIN public.next_eventos e ON e.id = ni.evento_id
   WHERE ni.check_in_at IS NOT NULL
     AND ni.membro_id IS NOT NULL
   ORDER BY 1, ni.check_in_at
)
UPDATE public.next_matriculas m
   SET check_in_at = p.check_in_at,
       check_in_by = coalesce(m.check_in_by, p.check_in_by),
       updated_at  = now()
  FROM presenca p
 WHERE m.origem_mes_key = p.chave
   AND m.deleted_at IS NULL
   AND m.check_in_at IS NULL;

-- Conferência (esperado: ~592 matrículas com check-in e ~2.124 linhas de Next
-- na view, contra 4 e 4.262 antes).
DO $$
DECLARE v_mat_checkin INT; v_view_next INT;
BEGIN
  SELECT count(*) INTO v_mat_checkin FROM public.next_matriculas
   WHERE check_in_at IS NOT NULL AND deleted_at IS NULL;
  SELECT count(*) INTO v_view_next FROM public.vw_inscricoes_unificadas
   WHERE porta IN ('next', 'next_legado');
  RAISE NOTICE 'Next · matrículas com presença: % · linhas de Next na view: %',
    v_mat_checkin, v_view_next;
END $$;

-- ── PARTE 3 · `origem = 'app'` na matrícula ─────────────────────────────────
-- O espelho de `services/nextMatricula.js` grava a matrícula com a origem real.
-- O CHECK vigente (20260707160000) aceita formulario|manual|totem — 'app'
-- faltava, e sem esta parte o espelho falharia com 23514 EM SILÊNCIO (o
-- serviço é best-effort de propósito: não pode derrubar a inscrição do app).
-- Descobre o nome real da constraint no catálogo antes de dropar (o nome pode
-- ter vindo do CREATE TABLE original ou de um ADD CONSTRAINT posterior).
DO $$
DECLARE v_con TEXT;
BEGIN
  SELECT con.conname INTO v_con
    FROM pg_constraint con
   WHERE con.conrelid = 'public.next_matriculas'::regclass
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%origem%'
   LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.next_matriculas DROP CONSTRAINT %I', v_con);
  END IF;
  ALTER TABLE public.next_matriculas
    ADD CONSTRAINT next_matriculas_origem_check
    CHECK (origem IN ('formulario', 'manual', 'totem', 'app'));
  RAISE NOTICE 'CHECK de origem de next_matriculas agora aceita app (constraint anterior: %)', coalesce(v_con, 'nenhuma');
END $$;
