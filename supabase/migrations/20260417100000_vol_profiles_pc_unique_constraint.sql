-- Fix: Replace partial unique indexes with proper unique constraints so that
-- Supabase's onConflict upserts work correctly.
--
-- Root cause: Both vol_profiles and vol_services have partial unique indexes
-- (WHERE column IS NOT NULL). Supabase JS generates
-- "ON CONFLICT (column) DO UPDATE" without a WHERE predicate, so PostgreSQL
-- cannot match the partial index and throws:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- The error is caught silently, causing all syncs to return 0 records.
--
-- Fix: Replace partial indexes with regular UNIQUE constraints. PostgreSQL
-- allows multiple NULLs in a UNIQUE constraint by default (NULLs are distinct),
-- so nullable columns still allow many rows with NULL.

-- ── vol_profiles ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS vol_profiles_pc_id_idx;

ALTER TABLE vol_profiles
  ADD CONSTRAINT vol_profiles_planning_center_id_key
  UNIQUE (planning_center_id);

-- ── vol_services ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS vol_services_pc_id_unique;

ALTER TABLE vol_services
  ADD CONSTRAINT vol_services_planning_center_id_key
  UNIQUE (planning_center_id);
