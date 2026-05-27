-- BUG: sync de escalas do Planning Center gravava 0 schedules desde ~abril/2026.
--
-- Causa raiz: backend/services/planningCenter.js faz upsert em vol_schedules com
--   onConflict: 'service_id,planning_center_person_id,team_name,position_name'
-- (4 colunas), mas essa constraint NUNCA foi criada no banco. So existia o
-- indice parcial de 2 colunas `vol_schedules_pc_unique`
--   UNIQUE (service_id, planning_center_person_id) WHERE planning_center_person_id IS NOT NULL
-- que o ON CONFLICT do supabase-js nao consegue casar (indice parcial exige a
-- clausula WHERE no proprio ON CONFLICT, que o supabase-js nao envia).
-- Resultado: erro 42P10 "no unique or exclusion constraint matching the ON
-- CONFLICT specification" em TODO upsert de escala → schedules_synced=0.
--
-- Diagnostico confirmado: GET /api/voluntariado/pco-schedule-debug mostrou que
-- o PCO devolve os team_members normalmente (HTTP 200, count>0), entao o
-- problema era so no upsert.
--
-- Fix: dropar o indice parcial de 2 colunas (que tambem impedia a mesma pessoa
-- em 2 posicoes no mesmo culto) e criar a constraint de 4 colunas que o codigo
-- ja espera. NULLS NOT DISTINCT (PG15+) garante que re-sync nao duplique quando
-- position_name eh NULL (caso comum · PCO manda so o nome do time em
-- team_position_name, sem " - posicao").

DROP INDEX IF EXISTS public.vol_schedules_pc_unique;

ALTER TABLE public.vol_schedules
  ADD CONSTRAINT vol_schedules_pc_unique
  UNIQUE NULLS NOT DISTINCT
  (service_id, planning_center_person_id, team_name, position_name);
