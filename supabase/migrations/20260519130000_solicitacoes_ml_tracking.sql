-- ============================================================================
-- Tracking de pedidos ML vinculados a solicitacoes
--
-- Quando o comprador faz a compra de uma solicitacao categoria='compras' no
-- Mercado Livre, ele vincula o pedido (cola URL/ID) na solicitacao. O
-- backend puxa shipment info da API ML, e um cron a cada 15min varre as
-- solicitacoes nao-entregues, detecta mudanca de status e notifica o
-- solicitante (in-app + WhatsApp quando configurado).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em solicitacoes
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS ml_order_id              text,
  ADD COLUMN IF NOT EXISTS ml_shipment_id           text,
  ADD COLUMN IF NOT EXISTS ml_tracking_number       text,
  ADD COLUMN IF NOT EXISTS ml_tracking_url          text,
  ADD COLUMN IF NOT EXISTS ml_item_title            text,
  ADD COLUMN IF NOT EXISTS ml_total_amount          numeric,
  ADD COLUMN IF NOT EXISTS ml_last_status           text,
  ADD COLUMN IF NOT EXISTS ml_last_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ml_last_checked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ml_linked_at             timestamptz,
  ADD COLUMN IF NOT EXISTS ml_linked_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ml_estimated_delivery    timestamptz;

-- Indice pro cron que precisa varrer "nao entregues com ml_shipment_id"
CREATE INDEX IF NOT EXISTS idx_solicitacoes_ml_tracking
  ON public.solicitacoes (ml_last_status, ml_last_checked_at)
  WHERE ml_shipment_id IS NOT NULL
    AND ml_last_status NOT IN ('delivered', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_solicitacoes_ml_order
  ON public.solicitacoes (ml_order_id)
  WHERE ml_order_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Timeline de eventos do tracking (append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.solicitacao_ml_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  status          text NOT NULL,
  substatus       text,
  descricao       text,
  ocorrido_em     timestamptz NOT NULL DEFAULT now(),
  raw_payload     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sol_ml_eventos_solicitacao
  ON public.solicitacao_ml_eventos (solicitacao_id, ocorrido_em DESC);

ALTER TABLE public.solicitacao_ml_eventos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_sol_ml_eventos" ON public.solicitacao_ml_eventos
    FOR ALL TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_read_sol_ml_eventos" ON public.solicitacao_ml_eventos
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.solicitacao_ml_eventos IS
  'Append-only · cada mudanca de status do shipment ML vira um evento. Alimenta a timeline visual e o historico de notificacoes.';

-- ----------------------------------------------------------------------------
-- 3. Telefone em profiles (para envio WhatsApp)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone text;

COMMENT ON COLUMN public.profiles.telefone IS
  'Telefone E.164 ou nacional (sera normalizado para 55XXXXXXXXXXX no envio). Usado para WhatsApp transacional (tracking pedidos ML, etc).';

-- ----------------------------------------------------------------------------
-- 4. View pratica para o cron e UI
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_solicitacoes_ml_pendentes AS
SELECT
  s.id,
  s.titulo,
  s.solicitante_id,
  s.ml_order_id,
  s.ml_shipment_id,
  s.ml_last_status,
  s.ml_last_status_changed_at,
  s.ml_last_checked_at,
  s.ml_linked_at,
  -- Cold = sem checagem ha mais de 30min; novo prioritario
  CASE
    WHEN s.ml_last_checked_at IS NULL THEN 0
    ELSE EXTRACT(EPOCH FROM (now() - s.ml_last_checked_at)) / 60
  END AS minutos_desde_check
FROM public.solicitacoes s
WHERE s.ml_shipment_id IS NOT NULL
  AND (s.ml_last_status IS NULL OR s.ml_last_status NOT IN ('delivered', 'cancelled'))
ORDER BY s.ml_last_checked_at ASC NULLS FIRST;

COMMENT ON VIEW public.vw_solicitacoes_ml_pendentes IS
  'Fila do cron: solicitacoes com pedido ML vinculado que ainda nao foram entregues nem canceladas.';
