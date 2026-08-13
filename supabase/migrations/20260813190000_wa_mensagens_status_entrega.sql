-- Recibos de entrega/leitura das mensagens do CHAT (13/08 · caso da Júlia:
-- Marcos respondeu e o sistema não sabia dizer se entregou/leu — o chat nem
-- guardava o wa_message_id da resposta, e o webhook descartava o recibo).
-- Espelho das colunas C0 de whatsapp_envios, agora em wa_mensagens.
-- Aditiva e idempotente; o código tolera a ausência (recibo de chat volta a
-- virar órfão até a coluna existir).
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS erro_status text;

COMMENT ON COLUMN public.wa_mensagens.delivered_at IS 'Recibo delivered da Meta (✓✓ na thread) · NULL = ainda não confirmado';
COMMENT ON COLUMN public.wa_mensagens.read_at IS 'Recibo read da Meta (✓✓ azul) · read implica delivered';
COMMENT ON COLUMN public.wa_mensagens.failed_at IS 'Recibo failed da Meta (mensagem NÃO chegou — ex.: número sem WhatsApp)';
COMMENT ON COLUMN public.wa_mensagens.erro_status IS 'Motivo do failed, cru da Meta';

-- Conferência:
-- SELECT column_name FROM information_schema.columns WHERE table_name='wa_mensagens'
--   AND column_name IN ('delivered_at','read_at','failed_at','erro_status');
