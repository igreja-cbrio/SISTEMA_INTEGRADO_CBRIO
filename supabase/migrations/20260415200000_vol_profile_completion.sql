-- ============================================================================
-- VOLUNTARIADO — Volunteer Portal: profile completion, CPF matching
-- Adds cpf, phone, profile_complete fields to vol_profiles
-- ============================================================================

-- ── Add fields to vol_profiles for volunteer onboarding ─────────────────────
ALTER TABLE vol_profiles ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE vol_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE vol_profiles ADD COLUMN IF NOT EXISTS profile_complete boolean NOT NULL DEFAULT false;
ALTER TABLE vol_profiles ADD COLUMN IF NOT EXISTS membresia_id uuid;

CREATE INDEX IF NOT EXISTS vol_profiles_cpf_idx ON vol_profiles(cpf) WHERE cpf IS NOT NULL;

-- ── Add user_id to vol_profiles (link supabase auth user) ───────────────────
-- auth_user_id already exists but let's also add a simpler alias
-- (auth_user_id is already there from the original migration)
