-- Depreciação de patrimônio · indicador GERENCIAL interno (decisão do usuário
-- 2026-07-29: NÃO é para prestação de contas oficial — taxas fiscais/ITG 2002
-- exigem validação do contador, fora de escopo aqui). Método linear simples,
-- calculado sob demanda a partir de valor_aquisicao/data_aquisicao +
-- vida_util_meses da categoria — NUNCA armazenado por período (sem ledger
-- mensal, sem cron, sem tabela nova).

ALTER TABLE public.pat_categorias
  ADD COLUMN IF NOT EXISTS vida_util_meses integer;

COMMENT ON COLUMN public.pat_categorias.vida_util_meses IS
  'Vida útil estimada em meses, usada só para o indicador GERENCIAL interno de depreciação linear do Patrimônio (não é taxa fiscal oficial). NULL = categoria sem depreciação configurada.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pat_categorias_vida_util_meses_positiva'
  ) THEN
    ALTER TABLE public.pat_categorias
      ADD CONSTRAINT chk_pat_categorias_vida_util_meses_positiva
      CHECK (vida_util_meses IS NULL OR vida_util_meses > 0);
  END IF;
END $$;
