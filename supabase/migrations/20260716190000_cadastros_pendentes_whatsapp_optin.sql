-- Consentimento de WhatsApp capturado nos formulários públicos de cadastro de
-- membresia e de inscrição em grupos (ambos passam por mem_cadastros_pendentes).
-- Propagado pra mem_membros.whatsapp_optin quando o cadastro é aprovado.
ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS whatsapp_optin boolean NOT NULL DEFAULT false;
ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS whatsapp_optin_em timestamptz;

COMMENT ON COLUMN public.mem_cadastros_pendentes.whatsapp_optin IS
  'Consentimento explícito p/ receber mensagens no WhatsApp (Marketing · LGPD). Propagado a mem_membros na aprovação.';
