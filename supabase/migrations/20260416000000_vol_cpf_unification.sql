-- ============================================================================
-- VOLUNTARIADO — CPF unification with Membresia
-- Adds: origem, allocation_status to vol_profiles
--       quer_servir to mem_membros
-- All changes are additive / backwards-compatible.
-- ============================================================================

-- ── vol_profiles: origem (where the volunteer came from) ────────────────────
ALTER TABLE vol_profiles
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'planning_center'
    CHECK (origem IN ('planning_center', 'membresia', 'manual'));

-- ── vol_profiles: allocation_status (is the volunteer placed in a team?) ────
ALTER TABLE vol_profiles
  ADD COLUMN IF NOT EXISTS allocation_status text NOT NULL DEFAULT 'active'
    CHECK (allocation_status IN ('active', 'waiting_allocation', 'inactive'));

-- ── Backfill origem from existing data ──────────────────────────────────────
UPDATE vol_profiles SET origem = 'planning_center'
  WHERE planning_center_id IS NOT NULL AND origem = 'planning_center';

UPDATE vol_profiles SET origem = 'membresia'
  WHERE membresia_id IS NOT NULL AND planning_center_id IS NULL;

-- ── mem_membros: quer_servir (member opted in to volunteer) ─────────────────
ALTER TABLE mem_membros
  ADD COLUMN IF NOT EXISTS quer_servir boolean NOT NULL DEFAULT false;

-- ── Useful index ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS vol_profiles_allocation_status_idx
  ON vol_profiles(allocation_status) WHERE allocation_status = 'waiting_allocation';
