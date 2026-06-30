-- ============================================================================
-- Next - "formado" vira POR PESSOA (cross-turma), fonte UNICA de "fez Next"
--
-- Contexto (Marcos + responsavel do Next, 2026-06-30): as 2 aulas do Next nao
-- sao sequenciais; a pessoa pode fazer a aula 1 numa turma e a aula 2 em OUTRA
-- e formar. Hoje "formado" e um status POR TURMA (presente nos 2 encontros DA
-- turma), o que torna formar cruzando turmas impossivel. Esta migration cria a
-- definicao UNICA de "fez Next" por PESSOA, que NSM/KPIs/Cuidados passam a ler.
--
-- Definicao (hibrida, nao perde ninguem):
--   formado = a pessoa tem presenca numa aula 1 E numa aula 2 (qualquer turma)
--             OU ja foi marcada (override manual do responsavel)
--             OU ja tem next_matriculas.status='formado' (preserva o historico,
--                incl. turmas multi-encontro do backfill mensal).
--
-- NAO altera next_matriculas.status (a tela de turma continua usando, per-turma).
-- Aditiva. Os read-sites passam a ler vw_next_formado_pessoa num PR seguinte.
-- ============================================================================

-- 1. Override manual: o responsavel do Next marca aula 1/2 quando a presenca
--    nao foi computada (pessoa esqueceu de assinar, etc). Chave = membro_id
--    (a porta CPF-less que cria stub+membro_id vem no PR da porta guardada).
CREATE TABLE IF NOT EXISTS public.next_pessoa_aula_manual (
  membro_id   uuid PRIMARY KEY REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  fez_aula1   boolean NOT NULL DEFAULT false,
  fez_aula2   boolean NOT NULL DEFAULT false,
  observacao  text,
  marcado_por uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.next_pessoa_aula_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS next_pessoa_aula_manual_select ON public.next_pessoa_aula_manual;
CREATE POLICY next_pessoa_aula_manual_select ON public.next_pessoa_aula_manual
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS next_pessoa_aula_manual_service ON public.next_pessoa_aula_manual;
CREATE POLICY next_pessoa_aula_manual_service ON public.next_pessoa_aula_manual
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. View UNICA: 1 linha por pessoa formada (membro_id quando ha; senao cpf/nome
--    pros orfaos via status legado). Os consumidores casam por membro_id/cpf/nome
--    e usam formado_em pra janela (mesma forma que liam next_matriculas).
CREATE OR REPLACE VIEW public.vw_next_formado_pessoa AS
WITH pres AS (
  -- presencas validas (aula 1/2) com membro_id; data com fallback p/ nunca-nula
  SELECT m.membro_id,
         e.numero,
         COALESCE(e.data, m.created_at::date) AS dt
  FROM public.next_presencas p
  JOIN public.next_encontros  e ON e.id = p.encontro_id AND e.numero IN (1, 2)
  JOIN public.next_matriculas m ON m.id = p.matricula_id
   AND m.deleted_at IS NULL AND m.membro_id IS NOT NULL
  WHERE p.presente = true
),
pres_pessoa AS (
  SELECT membro_id,
         bool_or(numero = 1) AS p1,
         bool_or(numero = 2) AS p2,
         min(dt) FILTER (WHERE numero = 1) AS d1,
         min(dt) FILTER (WHERE numero = 2) AS d2
  FROM pres GROUP BY membro_id
),
via_presenca AS (  -- completou cruzando/na turma, por presenca
  SELECT membro_id, GREATEST(d1, d2) AS formado_em
  FROM pres_pessoa WHERE p1 AND p2
),
via_manual AS (    -- override do responsavel
  SELECT membro_id, updated_at::date AS formado_em
  FROM public.next_pessoa_aula_manual WHERE fez_aula1 AND fez_aula2
),
via_status AS (    -- legado/per-turma: preserva os formados historicos
  SELECT m.membro_id, m.cpf, m.nome,
         COALESCE(max(e.data), max(m.created_at::date)) AS formado_em
  FROM public.next_matriculas m
  LEFT JOIN public.next_encontros e ON e.turma_id = m.turma_id
  WHERE m.deleted_at IS NULL AND m.status = 'formado'
  GROUP BY m.id, m.membro_id, m.cpf, m.nome
),
com_membro AS (    -- pessoas COM membro_id (deduplicadas)
  SELECT membro_id, min(formado_em) AS formado_em
  FROM (
    SELECT membro_id, formado_em FROM via_presenca
    UNION ALL SELECT membro_id, formado_em FROM via_manual
    UNION ALL SELECT membro_id, formado_em FROM via_status WHERE membro_id IS NOT NULL
  ) z
  GROUP BY membro_id
)
SELECT c.membro_id, mm.cpf, mm.nome, c.formado_em
FROM com_membro c
LEFT JOIN public.mem_membros mm ON mm.id = c.membro_id
UNION ALL
-- formados SEM membro_id (so via status legado): keyed por cpf/nome p/ matching
SELECT NULL::uuid AS membro_id, s.cpf, s.nome, min(s.formado_em) AS formado_em
FROM via_status s
WHERE s.membro_id IS NULL
GROUP BY s.cpf, s.nome;

GRANT SELECT ON public.vw_next_formado_pessoa TO authenticated, service_role;

COMMENT ON VIEW public.vw_next_formado_pessoa IS
  'Fonte unica de "fez Next" POR PESSOA (cross-turma): presenca aula1+aula2 OU override manual OU status=formado legado. NSM/KPIs/Cuidados leem daqui.';
