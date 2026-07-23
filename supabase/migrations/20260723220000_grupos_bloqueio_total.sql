-- ============================================================================
-- Grupos · BLOQUEIO GERAL de envios (garantia 100% · Marcos 2026-07-23)
--
-- O kill-switch anterior (grupos_auto_envios · migration 20260723180000) só
-- gateava o cron AUTOMÁTICO de frequência. Marcos pediu a garantia real: um
-- botão que, ligado, impede QUALQUER envio de grupos — automático, por evento
-- (inscrição/aprovação) OU manual. Esta coluna é esse bloqueio geral; o backend
-- checa em TODAS as funções de envio de grupos.
--
-- Default false = NÃO bloqueado (senão pararia a confirmação de inscrição da
-- abertura da temporada). É um botão de pânico que a coordenação liga quando
-- quiser 100% de silêncio. Idempotente · o código tolera ausência (lê false).
-- ============================================================================

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS grupos_bloqueio_total boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_config.grupos_bloqueio_total IS
  'BLOQUEIO GERAL dos envios de grupos (garantia 100%). true = NENHUM envio de grupos sai (automático, por evento OU manual). Default false. Marcos 2026-07-23.';

UPDATE public.whatsapp_config SET grupos_bloqueio_total = false WHERE grupos_bloqueio_total IS NULL;

NOTIFY pgrst, 'reload schema';
