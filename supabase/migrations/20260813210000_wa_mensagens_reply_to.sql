-- Citação (reply) nas mensagens do inbox (13/08 · caso da Júlia parte 2):
-- ela respondeu "Esse aqui" CITANDO o template com o nome do grupo, e o
-- sistema descartava o m.context — o atendente via um "Esse aqui" sem sentido.
-- Guarda o wamid da mensagem citada; a thread resolve e mostra o trecho.
-- Aditiva e idempotente; o código tolera a ausência (citação é gravada em
-- update isolado best-effort — sem a coluna, só não aparece o quote).
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS reply_to_wa_id text;

COMMENT ON COLUMN public.wa_mensagens.reply_to_wa_id IS
  'wamid da mensagem CITADA (m.context.id da Meta) quando a pessoa responde citando · NULL = mensagem normal';

-- Conferência:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='wa_mensagens' AND column_name='reply_to_wa_id';
