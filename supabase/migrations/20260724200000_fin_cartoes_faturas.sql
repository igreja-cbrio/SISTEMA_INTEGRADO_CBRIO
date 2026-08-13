-- Cartão de crédito · Fase 4 da reforma do Financeiro
--
-- Pedido do Matheus: ver a FATURA de cada cartão no Contas a Pagar (total +
-- vencimento), configurar fechamento/vencimento por cartão, a fatura ser
-- alimentada automaticamente pelas compras no cartão (compra depois do
-- fechamento cai na fatura do mês seguinte), e clicar na fatura pra ver cada
-- rubrica. A validação por IA compara o PDF da fatura com o que foi lançado.
--
-- Aditiva + idempotente.

-- ── Cartões ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_cartoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,                -- ex.: 'Santander Mastercard', 'Itaú Business'
  bandeira text,                     -- mastercard/visa/elo...
  final text,                        -- 4 últimos dígitos (exibição)
  dia_fechamento integer NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento integer NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  conta_id uuid REFERENCES public.fin_contas(id),  -- conta que paga a fatura
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fin_cartoes IS
  'Cartões de crédito corporativos (fechamento/vencimento → competência da fatura)';

ALTER TABLE public.fin_cartoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fin_cartoes' AND policyname='fin_cartoes_select') THEN
    CREATE POLICY fin_cartoes_select ON public.fin_cartoes FOR SELECT TO authenticated
      USING (public.current_user_module_level('financeiro') >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fin_cartoes' AND policyname='fin_cartoes_service') THEN
    CREATE POLICY fin_cartoes_service ON public.fin_cartoes FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Faturas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cartao_id uuid NOT NULL REFERENCES public.fin_cartoes(id) ON DELETE CASCADE,
  fechamento date NOT NULL,          -- último dia que ENTRA nesta fatura
  vencimento date NOT NULL,          -- quando paga
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada','paga')),
  total numeric NOT NULL DEFAULT 0,  -- soma dos itens (recalculada no sync)
  contas_pagar_id uuid REFERENCES public.fin_contas_pagar(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cartao_id, vencimento)
);
COMMENT ON TABLE public.fin_faturas IS
  'Ciclo de fatura do cartão · vira 1 linha no Contas a Pagar (contas_pagar_id)';

ALTER TABLE public.fin_faturas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fin_faturas' AND policyname='fin_faturas_select') THEN
    CREATE POLICY fin_faturas_select ON public.fin_faturas FOR SELECT TO authenticated
      USING (public.current_user_module_level('financeiro') >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fin_faturas' AND policyname='fin_faturas_service') THEN
    CREATE POLICY fin_faturas_service ON public.fin_faturas FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Vínculos nos itens ───────────────────────────────────────────────
ALTER TABLE public.fin_transacoes ADD COLUMN IF NOT EXISTS cartao_id uuid REFERENCES public.fin_cartoes(id);
ALTER TABLE public.fin_transacoes ADD COLUMN IF NOT EXISTS fatura_id uuid REFERENCES public.fin_faturas(id);
ALTER TABLE public.fin_contas_pagar ADD COLUMN IF NOT EXISTS cartao_id uuid REFERENCES public.fin_cartoes(id);
ALTER TABLE public.fin_contas_pagar ADD COLUMN IF NOT EXISTS fatura_id uuid REFERENCES public.fin_faturas(id);
ALTER TABLE public.log_compras ADD COLUMN IF NOT EXISTS cartao_id uuid REFERENCES public.fin_cartoes(id);
ALTER TABLE public.log_compras ADD COLUMN IF NOT EXISTS fatura_id uuid REFERENCES public.fin_faturas(id);

CREATE INDEX IF NOT EXISTS idx_fin_transacoes_fatura ON public.fin_transacoes (fatura_id) WHERE fatura_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_log_compras_fatura ON public.log_compras (fatura_id) WHERE fatura_id IS NOT NULL;

COMMENT ON COLUMN public.fin_transacoes.fatura_id IS
  'Despesa de cartão manual → item da fatura (não usar junto com compra da Logística, senão duplica)';
COMMENT ON COLUMN public.log_compras.fatura_id IS
  'Compra no cartão (Logística/scan/WhatsApp/app) → item da fatura';
