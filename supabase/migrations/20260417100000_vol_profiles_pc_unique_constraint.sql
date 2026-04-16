-- Fix: Replace partial unique index on vol_profiles.planning_center_id with a
-- proper unique constraint so that Supabase's onConflict upsert works.
--
-- Root cause: Supabase JS generates "ON CONFLICT (planning_center_id)" without
-- a WHERE predicate. PostgreSQL cannot match a partial index
-- (WHERE planning_center_id IS NOT NULL) from that spec and throws
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification", causing upsertVolunteerProfiles to silently return 0.
--
-- Fix: A regular UNIQUE constraint allows multiple NULLs in PostgreSQL (NULLs
-- are distinct), so internal volunteers without a planning_center_id are fine.

-- 1. Drop the old partial index
DROP INDEX IF EXISTS vol_profiles_pc_id_idx;

-- 2. Add a proper unique constraint (non-partial)
ALTER TABLE vol_profiles
  ADD CONSTRAINT vol_profiles_planning_center_id_key
  UNIQUE (planning_center_id);
