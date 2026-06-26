-- ============================================================================
-- Next · dedup da LISTA DE ESPERA (matrículas sem turma)
--
-- A lista de espera = next_matriculas com turma_id IS NULL. Ela não tinha
-- nenhuma trava de duplicidade, então um reenvio do formulário público criava
-- 2 linhas de espera da mesma pessoa (CPF é opcional → o UNIQUE por cpf não
-- pega). Quando uma turma abre e "puxa a espera", as duplicatas entram/colidem.
--
-- Aqui: (1) consolidamos as duplicatas já existentes (mantém a mais antiga por
-- pessoa, soft-delete o resto) e (2) criamos um índice parcial que garante
-- 1 matrícula em espera por pessoa (membro_id). Dedup por membro_id (não cpf)
-- porque o formulário sempre resolve a pessoa via findOrCreateMembro.
-- ============================================================================

-- 1) Consolida duplicatas de espera existentes (mantém a 1ª por membro_id).
WITH dups AS (
  SELECT id,
         row_number() OVER (PARTITION BY membro_id ORDER BY created_at, id) AS rn
  FROM public.next_matriculas
  WHERE turma_id IS NULL
    AND deleted_at IS NULL
    AND membro_id IS NOT NULL
)
UPDATE public.next_matriculas m
SET deleted_at = now()
FROM dups
WHERE dups.id = m.id
  AND dups.rn > 1;

-- 2) Trava: 1 matrícula em espera por pessoa (só vale pra fila · turma_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_matriculas_espera_membro
  ON public.next_matriculas (membro_id)
  WHERE turma_id IS NULL AND deleted_at IS NULL AND membro_id IS NOT NULL;
