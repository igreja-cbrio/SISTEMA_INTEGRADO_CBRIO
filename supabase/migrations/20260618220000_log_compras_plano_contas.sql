-- Compras · plano de contas do financeiro na compra
--
-- Além do centro de custo, a compra passa a apontar pro PLANO DE CONTAS
-- (fin_plano_contas) — consolidação completa com o financeiro. Vincular a saída
-- do balanço também passa a herdar o plano de contas da fin_transacoes.

ALTER TABLE public.log_compras
  ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_log_compras_plano
  ON public.log_compras (plano_contas_id) WHERE plano_contas_id IS NOT NULL;

COMMENT ON COLUMN public.log_compras.plano_contas_id IS
  'Plano de contas (fin_plano_contas) da compra. Sugerido pela IA no scan e/ou herdado da saída do balanço ao vincular.';
