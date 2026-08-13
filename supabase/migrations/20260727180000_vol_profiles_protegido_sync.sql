-- Marca perfis de voluntário editados manualmente pela equipe, para que o sync
-- horário do Planning Center NÃO sobrescreva o nome/e-mail/avatar editados.
-- Aditivo/idempotente; o código trata a ausência como false.
ALTER TABLE public.vol_profiles
  ADD COLUMN IF NOT EXISTS protegido_sync boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vol_profiles.protegido_sync IS
  'true = perfil editado manualmente pela equipe; upsertVolunteerProfiles pula full_name/email/avatar desse perfil no sync do PCO.';
