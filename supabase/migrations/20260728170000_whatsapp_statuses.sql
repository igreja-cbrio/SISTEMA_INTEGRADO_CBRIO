-- Módulo Comunicação · C0 — capturar os statuses de entrega da Meta.
-- Hoje o webhook ignora value.statuses[] → 'enviado' = a Graph aceitou o POST,
-- não que entregou. Estas colunas guardam entrega/leitura/falha por message_id.
-- Aditiva/idempotente · ZERO mudança no comportamento de envio.

ALTER TABLE public.whatsapp_envios
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS erro_status text;

COMMENT ON COLUMN public.whatsapp_envios.delivered_at IS 'Meta status=delivered (webhook)';
COMMENT ON COLUMN public.whatsapp_envios.read_at IS 'Meta status=read (webhook)';
COMMENT ON COLUMN public.whatsapp_envios.failed_at IS 'Meta status=failed (webhook)';
COMMENT ON COLUMN public.whatsapp_envios.erro_status IS 'Código/motivo do status=failed da Meta';

-- Statuses chegam por message_id — índice pra o UPDATE do webhook.
CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_message_id
  ON public.whatsapp_envios (message_id) WHERE message_id IS NOT NULL;

-- Statuses cujo message_id não bate em whatsapp_envios (ex.: mensagens do chat
-- enviadas fora da fila) — nada se perde; a correlação fina vem em fases depois.
CREATE TABLE IF NOT EXISTS public.whatsapp_status_orfaos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  status text,
  status_timestamp timestamptz,
  erro text,
  raw jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status_orfaos_msg
  ON public.whatsapp_status_orfaos (message_id);

-- RLS: tabela só de backend (service role). Lei do projeto: tabela nova = RLS.
ALTER TABLE public.whatsapp_status_orfaos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='whatsapp_status_orfaos' AND policyname='wa_status_orfaos_service') THEN
    CREATE POLICY wa_status_orfaos_service ON public.whatsapp_status_orfaos
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
