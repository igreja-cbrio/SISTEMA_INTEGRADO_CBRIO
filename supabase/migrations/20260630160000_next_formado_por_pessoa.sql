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
-- Data de "fez Next" (formado_em) = min(created_at) das matriculas da pessoa
-- (= "primeira vez no Next"), IGUAL ao que a NSM usa hoje -> flip neutro na NSM
-- (validado: sinal Next na coorte 90d fica 1->1). A data do encontro NAO e usada
-- (historico tem turmas multi-encontro com datas ruins).
CREATE OR REPLACE VIEW public.vw_next_formado_pessoa AS
WITH presence_aulas AS (  -- presenca em aula 1/2 (qualquer turma), por pessoa
  SELECT m.membro_id,
         bool_or(e.numero = 1) AS a1,
         bool_or(e.numero = 2) AS a2
  FROM public.next_presencas p
  JOIN public.next_encontros  e ON e.id = p.encontro_id AND e.numero IN (1, 2)
  JOIN public.next_matriculas m ON m.id = p.matricula_id
   AND m.deleted_at IS NULL AND m.membro_id IS NOT NULL
  WHERE p.presente = true
  GROUP BY m.membro_id
),
manual AS (  -- override do responsavel
  SELECT membro_id, updated_at::date AS dt
  FROM public.next_pessoa_aula_manual WHERE fez_aula1 AND fez_aula2
),
status_membro AS (  -- legado/per-turma (preserva os formados historicos)
  SELECT DISTINCT membro_id FROM public.next_matriculas
  WHERE deleted_at IS NULL AND status = 'formado' AND membro_id IS NOT NULL
),
formado_membros AS (  -- uniao das 3 fontes (chave = membro_id)
  SELECT membro_id FROM presence_aulas WHERE a1 AND a2
  UNION SELECT membro_id FROM manual
  UNION SELECT membro_id FROM status_membro
),
mat_min AS (  -- min(created_at) de todas as matriculas da pessoa = "1a vez no Next"
  SELECT membro_id, min(created_at::date) AS dt
  FROM public.next_matriculas
  WHERE deleted_at IS NULL AND membro_id IS NOT NULL
  GROUP BY membro_id
)
SELECT f.membro_id, mm.cpf, mm.nome,
       COALESCE(mat_min.dt, man.dt) AS formado_em
FROM formado_membros f
LEFT JOIN mat_min ON mat_min.membro_id = f.membro_id
LEFT JOIN manual  man ON man.membro_id = f.membro_id
LEFT JOIN public.mem_membros mm ON mm.id = f.membro_id
UNION ALL
-- formados SEM membro_id (so via status legado): keyed por cpf/nome p/ matching
SELECT NULL::uuid AS membro_id, m.cpf, m.nome, min(m.created_at::date) AS formado_em
FROM public.next_matriculas m
WHERE m.deleted_at IS NULL AND m.status = 'formado' AND m.membro_id IS NULL
GROUP BY m.cpf, m.nome;

GRANT SELECT ON public.vw_next_formado_pessoa TO authenticated, service_role;

COMMENT ON VIEW public.vw_next_formado_pessoa IS
  'Fonte unica de "fez Next" POR PESSOA (cross-turma): presenca aula1+aula2 OU override manual OU status=formado legado. NSM/KPIs/Cuidados leem daqui.';
