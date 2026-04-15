-- ============================================================================
-- VOLUNTARIADO — Schedule Management System
-- Adds in-house scheduling capabilities (teams, positions, availability,
-- service types, and full CRUD for schedules).
-- ============================================================================

-- ── vol_service_types — Recurring service templates ─────────────────────────
-- e.g. "Culto Domingo Manha", "Culto Quarta", "Ensaio Louvor"
CREATE TABLE IF NOT EXISTS public.vol_service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  -- Recurrence: weekday 0=Sun..6=Sat, time HH:MM, active flag
  recurrence_day smallint CHECK (recurrence_day BETWEEN 0 AND 6),
  recurrence_time time,
  is_active boolean NOT NULL DEFAULT true,
  color text, -- hex color for calendar display
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── vol_teams — Formal team definitions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color text, -- hex color for UI badges
  leader_profile_id uuid REFERENCES vol_profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── vol_positions — Positions within teams ──────────────────────────────────
-- e.g. "Vocalista", "Tecladista", "Camera 1", "Recepcionista"
CREATE TABLE IF NOT EXISTS public.vol_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES vol_teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  min_volunteers integer NOT NULL DEFAULT 1,
  max_volunteers integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, name)
);

-- ── vol_team_members — Volunteer ↔ Team/Position assignments (home team) ───
CREATE TABLE IF NOT EXISTS public.vol_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES vol_teams(id) ON DELETE CASCADE,
  position_id uuid REFERENCES vol_positions(id) ON DELETE SET NULL,
  -- Support both vol_profiles AND PC-only volunteers
  volunteer_profile_id uuid REFERENCES vol_profiles(id) ON DELETE CASCADE,
  planning_center_person_id text,
  volunteer_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Each volunteer can only be in a team once
  UNIQUE(team_id, volunteer_profile_id),
  -- At least one identifier must be present
  CHECK (volunteer_profile_id IS NOT NULL OR planning_center_person_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS vol_team_members_team_idx ON vol_team_members(team_id);
CREATE INDEX IF NOT EXISTS vol_team_members_profile_idx ON vol_team_members(volunteer_profile_id);
CREATE INDEX IF NOT EXISTS vol_team_members_pc_idx ON vol_team_members(planning_center_person_id);

-- ── vol_availability — Volunteer unavailability ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_profile_id uuid REFERENCES vol_profiles(id) ON DELETE CASCADE,
  planning_center_person_id text,
  -- Date range of unavailability
  unavailable_from date NOT NULL,
  unavailable_to date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (unavailable_to >= unavailable_from),
  CHECK (volunteer_profile_id IS NOT NULL OR planning_center_person_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS vol_availability_profile_idx ON vol_availability(volunteer_profile_id);
CREATE INDEX IF NOT EXISTS vol_availability_dates_idx ON vol_availability(unavailable_from, unavailable_to);

-- ── Alter vol_services — make planning_center_id optional ───────────────────
-- This allows manual service creation without PC sync
ALTER TABLE vol_services ALTER COLUMN planning_center_id DROP NOT NULL;
DROP INDEX IF EXISTS vol_services_planning_center_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS vol_services_pc_id_unique
  ON vol_services(planning_center_id) WHERE planning_center_id IS NOT NULL;

-- Add service_type_id reference
ALTER TABLE vol_services ADD COLUMN IF NOT EXISTS service_type_id uuid REFERENCES vol_service_types(id) ON DELETE SET NULL;

-- ── Alter vol_schedules — support manual scheduling ─────────────────────────
-- planning_center_person_id was NOT NULL, but manual schedules won't have it
-- We need to allow NULL and add team_id/position_id references
ALTER TABLE vol_schedules ALTER COLUMN planning_center_person_id DROP NOT NULL;

ALTER TABLE vol_schedules ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES vol_teams(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES vol_positions(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'planning_center'
  CHECK (source IN ('planning_center', 'manual', 'auto_rotation'));
ALTER TABLE vol_schedules ADD COLUMN IF NOT EXISTS notes text;

-- Update the unique constraint to handle both PC and manual schedules
-- The old constraint was (service_id, planning_center_person_id)
-- For manual schedules, we use (service_id, volunteer_id, team_id)
ALTER TABLE vol_schedules DROP CONSTRAINT IF EXISTS vol_schedules_service_person_unique;
CREATE UNIQUE INDEX IF NOT EXISTS vol_schedules_pc_unique
  ON vol_schedules(service_id, planning_center_person_id)
  WHERE planning_center_person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vol_schedules_manual_unique
  ON vol_schedules(service_id, volunteer_id, team_id)
  WHERE planning_center_person_id IS NULL AND volunteer_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE vol_service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON vol_service_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_team_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON vol_availability FOR ALL USING (true) WITH CHECK (true);

-- ── Triggers for updated_at ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER vol_service_types_updated_at BEFORE UPDATE ON vol_service_types
    FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER vol_teams_updated_at BEFORE UPDATE ON vol_teams
    FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
