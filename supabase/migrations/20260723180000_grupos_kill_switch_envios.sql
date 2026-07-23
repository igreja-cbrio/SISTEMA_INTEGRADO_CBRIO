-- ============================================================================
-- Grupos · INTERRUPTOR DE ENVIOS AUTOMÁTICOS (barreira · Marcos 2026-07-23)
--
-- Contexto: susto com envios proativos a líderes. Auditoria mostrou que o único
-- envio AUTOMÁTICO proativo que sobra (após remover a cobrança em #1865 e o
-- estudo semanal em 23/07) é o cron mensal de frequência. Esta coluna é o
-- kill-switch central: enquanto FALSE, nenhum cron enfileira envio proativo pro
-- líder. Começa DESLIGADO (estado seguro) — a coordenação liga na aba Envios
-- quando quiser o disparo automático. Envio MANUAL (aba Envios) NÃO depende
-- disto (é ação humana com prévia + confirmação).
--
-- Idempotente e backwards-compatible (código tolera ausência: trata como false).
-- ============================================================================

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS grupos_auto_envios boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_config.grupos_auto_envios IS
  'Kill-switch dos envios AUTOMÁTICOS (cron) proativos de grupos. false = nenhum cron dispara mensagem pro líder (estado seguro · default). Envio manual da aba Envios não depende disto. Marcos 2026-07-23.';

-- Garante o estado seguro na linha singleton existente (a coluna nasce false,
-- mas reforça caso a linha já exista com algum default herdado).
UPDATE public.whatsapp_config SET grupos_auto_envios = false WHERE grupos_auto_envios IS NULL;

NOTIFY pgrst, 'reload schema';
