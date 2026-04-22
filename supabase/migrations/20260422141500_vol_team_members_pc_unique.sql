-- Partial unique index for PC-only team members
-- The base schema has UNIQUE(team_id, volunteer_profile_id) but NULL is treated
-- as distinct in UNIQUE constraints, so PC-only volunteers (no vol_profiles
-- linkage yet) could be inserted multiple times for the same team.
CREATE UNIQUE INDEX IF NOT EXISTS vol_team_members_team_pc_unique
  ON public.vol_team_members(team_id, planning_center_person_id)
  WHERE volunteer_profile_id IS NULL AND planning_center_person_id IS NOT NULL;
