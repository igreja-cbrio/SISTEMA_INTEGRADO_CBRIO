-- ============================================================================
-- VOLUNTARIADO MODULE — Consolidated migration
-- Migrated from checkincbrio (Lovable) into the main CBRio ERP system.
--
-- Tables created (all prefixed with vol_ to avoid conflicts):
--   vol_profiles        — Volunteer profiles linked to Planning Center
--   vol_user_roles      — Volunteer role assignments (volunteer/leader/admin)
--   vol_services        — Services synced from Planning Center
--   vol_schedules       — Volunteer schedules per service
--   vol_check_ins       — Check-in records (QR, facial, manual, self-service)
--   vol_volunteer_qrcodes — QR codes for PC volunteers without accounts
--   vol_sync_logs       — Planning Center sync history
--   vol_training_checkins — Training registration records
--
-- Also creates:
--   - pgvector extension for face recognition
--   - Face descriptor columns and matching functions
--   - Supabase storage bucket for face photos
-- ============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pgvector may already exist; skip if not available
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pgvector not available, face matching will be disabled'; END $$;

-- ── Role enum ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.vol_user_role AS ENUM ('volunteer', 'leader', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── vol_profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  planning_center_id text,
  qr_code text UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  avatar_url text,
  face_descriptor vector(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vol_profiles_auth_user_idx ON vol_profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vol_profiles_pc_id_idx ON vol_profiles(planning_center_id) WHERE planning_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vol_profiles_email_idx ON vol_profiles(email);

-- ── vol_user_roles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES vol_profiles(id) ON DELETE CASCADE,
  role vol_user_role NOT NULL DEFAULT 'volunteer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, role)
);

-- ── vol_services ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_center_id text UNIQUE NOT NULL,
  name text NOT NULL,
  service_type_name text,
  scheduled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vol_services_scheduled_idx ON vol_services(scheduled_at);

-- ── vol_schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES vol_services(id) ON DELETE CASCADE,
  volunteer_id uuid REFERENCES vol_profiles(id) ON DELETE SET NULL,
  planning_center_person_id text NOT NULL,
  volunteer_name text NOT NULL,
  team_name text,
  position_name text,
  confirmation_status text DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vol_schedules_service_person_unique UNIQUE (service_id, planning_center_person_id)
);

CREATE INDEX IF NOT EXISTS vol_schedules_service_idx ON vol_schedules(service_id);
CREATE INDEX IF NOT EXISTS vol_schedules_volunteer_idx ON vol_schedules(volunteer_id);
CREATE INDEX IF NOT EXISTS vol_schedules_pc_person_idx ON vol_schedules(planning_center_person_id);

-- ── vol_check_ins ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES vol_schedules(id) ON DELETE CASCADE,
  volunteer_id uuid REFERENCES vol_profiles(id) ON DELETE SET NULL,
  service_id uuid REFERENCES vol_services(id) ON DELETE SET NULL,
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL CHECK (method IN ('qr_code', 'manual', 'facial', 'self_service')),
  is_unscheduled boolean NOT NULL DEFAULT false
);

-- Unique constraints to prevent duplicate check-ins
CREATE UNIQUE INDEX IF NOT EXISTS vol_check_ins_schedule_unique
  ON vol_check_ins(schedule_id)
  WHERE schedule_id IS NOT NULL AND is_unscheduled = false;

CREATE UNIQUE INDEX IF NOT EXISTS vol_check_ins_unscheduled_unique
  ON vol_check_ins(volunteer_id, service_id)
  WHERE is_unscheduled = true AND volunteer_id IS NOT NULL AND service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vol_check_ins_service_idx ON vol_check_ins(service_id);
CREATE INDEX IF NOT EXISTS vol_check_ins_volunteer_idx ON vol_check_ins(volunteer_id);

-- ── vol_volunteer_qrcodes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_volunteer_qrcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_center_person_id text UNIQUE NOT NULL,
  volunteer_name text NOT NULL,
  qr_code text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  avatar_url text,
  face_descriptor vector(128),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── vol_sync_logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL DEFAULT 'manual',
  services_synced integer NOT NULL DEFAULT 0,
  schedules_synced integer NOT NULL DEFAULT 0,
  qrcodes_generated integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vol_sync_logs_created_idx ON vol_sync_logs(created_at DESC);

-- ── vol_training_checkins ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_training_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES vol_services(id) ON DELETE SET NULL,
  volunteer_name text NOT NULL,
  team_name text NOT NULL,
  phone text,
  registered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Face matching function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vol_find_face_match(
  query_descriptor vector(128),
  match_threshold float DEFAULT 0.6
)
RETURNS TABLE (
  volunteer_id uuid,
  volunteer_name text,
  planning_center_id text,
  avatar_url text,
  source text,
  distance float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Search in vol_profiles
  SELECT
    p.id as volunteer_id,
    p.full_name as volunteer_name,
    p.planning_center_id,
    p.avatar_url,
    'profile'::text as source,
    (p.face_descriptor <-> query_descriptor)::float as distance
  FROM vol_profiles p
  WHERE p.face_descriptor IS NOT NULL
    AND (p.face_descriptor <-> query_descriptor) < match_threshold

  UNION ALL

  -- Search in vol_volunteer_qrcodes
  SELECT
    v.id as volunteer_id,
    v.volunteer_name,
    v.planning_center_person_id as planning_center_id,
    v.avatar_url,
    'volunteer_qrcode'::text as source,
    (v.face_descriptor <-> query_descriptor)::float as distance
  FROM vol_volunteer_qrcodes v
  WHERE v.face_descriptor IS NOT NULL
    AND (v.face_descriptor <-> query_descriptor) < match_threshold

  ORDER BY distance
  LIMIT 1;
END;
$$;

-- ── Face descriptor save functions ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vol_save_profile_face_descriptor(
  p_profile_id uuid,
  descriptor real[],
  photo_url text DEFAULT NULL
)
RETURNS TABLE(id uuid, saved boolean, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF array_length(descriptor, 1) != 128 THEN
    RAISE EXCEPTION 'Descriptor must have exactly 128 dimensions, got %', array_length(descriptor, 1);
  END IF;
  RETURN QUERY
  UPDATE vol_profiles p
  SET
    face_descriptor = array_to_vector(descriptor, 128, true),
    avatar_url = COALESCE(photo_url, p.avatar_url),
    updated_at = now()
  WHERE p.id = p_profile_id
  RETURNING p.id, (p.face_descriptor IS NOT NULL) as saved, p.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.vol_save_qrcode_face_descriptor(
  qrcode_id uuid,
  descriptor real[],
  photo_url text DEFAULT NULL
)
RETURNS TABLE(id uuid, volunteer_name text, saved boolean, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF array_length(descriptor, 1) != 128 THEN
    RAISE EXCEPTION 'Descriptor must have exactly 128 dimensions, got %', array_length(descriptor, 1);
  END IF;
  RETURN QUERY
  UPDATE vol_volunteer_qrcodes v
  SET
    face_descriptor = array_to_vector(descriptor, 128, true),
    avatar_url = COALESCE(photo_url, v.avatar_url),
    updated_at = now()
  WHERE v.id = qrcode_id
  RETURNING v.id, v.volunteer_name, (v.face_descriptor IS NOT NULL) as saved, v.updated_at;
END;
$$;

-- ── Triggers for updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vol_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$ BEGIN
  CREATE TRIGGER vol_profiles_updated_at BEFORE UPDATE ON vol_profiles
    FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER vol_services_updated_at BEFORE UPDATE ON vol_services
    FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER vol_qrcodes_updated_at BEFORE UPDATE ON vol_volunteer_qrcodes
    FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Enable RLS (permissive — backend uses service role) ───────────────────────
ALTER TABLE vol_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_volunteer_qrcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_training_checkins ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (the Express backend uses service_role key)
CREATE POLICY "service_role_all" ON vol_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_user_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_check_ins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_volunteer_qrcodes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_sync_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_training_checkins FOR ALL USING (true) WITH CHECK (true);

-- ── Storage bucket for face photos ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vol-face-photos', 'vol-face-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ── Face descriptor indexes (IVFFlat for fast similarity search) ──────────────
-- These require pgvector; wrapped in DO block to gracefully skip if not available
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS vol_profiles_face_idx
    ON vol_profiles USING ivfflat (face_descriptor vector_cosine_ops)
    WHERE face_descriptor IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create face descriptor index on vol_profiles';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS vol_qrcodes_face_idx
    ON vol_volunteer_qrcodes USING ivfflat (face_descriptor vector_cosine_ops)
    WHERE face_descriptor IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create face descriptor index on vol_volunteer_qrcodes';
END $$;
