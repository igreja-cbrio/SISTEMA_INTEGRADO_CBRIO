-- Multi-número (preparo do CBZap · revisão do módulo Comunicação 05/08):
-- registra por QUAL número da WABA cada conversa do inbox acontece, pra a
-- resposta do time sair pelo MESMO número que recebeu a mensagem.
-- NULL = número institucional da env (comportamento histórico).
-- Aditiva e idempotente; o código é best-effort e funciona sem ela
-- (tudo continua saindo pelo número da env até a coluna existir).
ALTER TABLE public.wa_conversas
  ADD COLUMN IF NOT EXISTS phone_number_id text;

COMMENT ON COLUMN public.wa_conversas.phone_number_id IS
  'phone_number_id (Meta) do número da WABA por onde a conversa acontece · NULL = número institucional (env WHATSAPP_PHONE_NUMBER_ID)';
