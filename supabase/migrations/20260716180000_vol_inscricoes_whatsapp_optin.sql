-- Consentimento de WhatsApp capturado no formulário público de voluntariado.
-- Aditivo/idempotente. Propagado pra mem_membros.whatsapp_optin quando a
-- inscrição casa com um membro (no submit ou num vínculo futuro).
ALTER TABLE public.vol_inscricoes
  ADD COLUMN IF NOT EXISTS whatsapp_optin boolean NOT NULL DEFAULT false;
ALTER TABLE public.vol_inscricoes
  ADD COLUMN IF NOT EXISTS whatsapp_optin_em timestamptz;

COMMENT ON COLUMN public.vol_inscricoes.whatsapp_optin IS
  'Consentimento explícito p/ receber mensagens no WhatsApp (Marketing · LGPD). Capturado no form público.';
