-- Interruptor CENTRAL dos disparos automáticos (decisão do Marcos · 14/08:
-- "na aba de disparos automáticos eu não consigo cancelar isso"). A aba
-- Disparos→Automáticas era 100% leitura; cada cron só desligava mexendo em env
-- ou deploy. Guarda os IDs DESLIGADOS (catálogo comunicacaoAutomaticas):
-- aniversario_voluntario · batismo_lembrete · grupos_frequencia ·
-- devocional_diario. Vazio = tudo liga (comportamento histórico).
-- Aditiva e idempotente; o código tolera a ausência (coluna faltando = nada
-- desligado + o toggle da tela avisa).
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS disparos_off jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.whatsapp_config.disparos_off IS
  'IDs de disparos automáticos DESLIGADOS pela aba Comunicação→Disparos (catálogo comunicacaoAutomaticas) · [] = tudo ligado';

-- Conferência:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='whatsapp_config' AND column_name='disparos_off';
