-- ============================================================
-- Membresia · consentimento (opt-in) pra receber mensagens no WhatsApp
-- Marcado pelo membro no app (perfil/configurações). LGPD: guardamos o
-- momento do consentimento. O disparo de mensagens (utility/marketing)
-- deve respeitar este flag.
-- ============================================================
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS whatsapp_optin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_optin_em timestamptz;

COMMENT ON COLUMN public.mem_membros.whatsapp_optin IS
  'Consentimento do membro pra receber mensagens no WhatsApp (opt-in). Marcado no app.';
COMMENT ON COLUMN public.mem_membros.whatsapp_optin_em IS
  'Momento em que o membro deu/retirou o consentimento de WhatsApp (LGPD).';
