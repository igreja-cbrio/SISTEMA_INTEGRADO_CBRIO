-- =====================================================================
-- Onda 3 follow-up · UUID FKs pra colunas TEXT "responsavel/leader"
-- =====================================================================
-- Memoria conhecida (feedback_responsible_by_uuid): "Responsáveis por UUID"
-- · campos `responsible` devem usar profiles.id (UUID), nunca texto livre.
--
-- Problema atual:
--   6 colunas TEXT em 5 tabelas armazenam nome de pessoa como string livre.
--   Quando profile muda nome (caso Alda Lorena → Lorena), filtros JS tipo
--   `p.leader === profile.name` quebram. Migration 20260519240000 teve que
--   fazer UPDATE manual em 5 tabelas pra propagar a mudança.
--
-- Estratégia (backward-compatible · aditiva):
--   1. ADD COLUMN `*_id UUID REFERENCES profiles(id) ON DELETE SET NULL`
--      (mantem coluna TEXT antiga · backend e frontend ainda usam)
--   2. UPDATE via JOIN com profiles.name (LOWER + TRIM pra ser tolerante)
--   3. CREATE INDEX nas novas FKs
--   4. NAO dropa colunas antigas · isso fica em PR follow-up depois que
--      backend/frontend migrarem pra usar os novos *_id
--
-- Justificativa de profiles(id) como destino (vs mem_membros ou usuarios):
--   - profiles eh source-of-truth de identidade (FK auth.users)
--   - profile.name eh o nome de visualização canônico
--   - profiles ja eh usado em ModuleGuard, AuthContext, etc
--   - mem_membros eh subset (so quem eh membro da igreja · alguns staff
--     nao sao membros oficiais ainda)
--   - usuarios eh tabela granular de permissões · ID legacy
--
-- Tabelas alvo (6 colunas em 5 tabelas):
--   - area_responsaveis.responsavel_nome   → responsavel_id
--   - projects.leader                       → leader_id
--   - projects.responsible                  → responsible_id
--   - event_tasks.responsible               → responsible_id
--   - cycle_phase_tasks.responsavel_nome    → responsavel_id
--   - project_tasks.responsible             → responsible_id
--
-- Idempotente · ADD IF NOT EXISTS + UPDATE WHERE _id IS NULL.
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · ADD COLUMN nas 5 tabelas
-- =====================================================================
ALTER TABLE public.area_responsaveis
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cycle_phase_tasks
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =====================================================================
-- ETAPA 2 · UPDATE · popula via JOIN com profiles
-- LOWER + TRIM pra ser tolerante a typos/espaços
-- =====================================================================

-- area_responsaveis
UPDATE public.area_responsaveis ar
   SET responsavel_id = p.id, updated_at = now()
  FROM public.profiles p
 WHERE LOWER(TRIM(ar.responsavel_nome)) = LOWER(TRIM(p.name))
   AND ar.responsavel_id IS NULL
   AND p.active = true;

-- projects.leader
UPDATE public.projects pr
   SET leader_id = p.id
  FROM public.profiles p
 WHERE LOWER(TRIM(pr.leader)) = LOWER(TRIM(p.name))
   AND pr.leader_id IS NULL
   AND pr.leader IS NOT NULL
   AND p.active = true;

-- projects.responsible
UPDATE public.projects pr
   SET responsible_id = p.id
  FROM public.profiles p
 WHERE LOWER(TRIM(pr.responsible)) = LOWER(TRIM(p.name))
   AND pr.responsible_id IS NULL
   AND pr.responsible IS NOT NULL
   AND p.active = true;

-- event_tasks.responsible
UPDATE public.event_tasks et
   SET responsible_id = p.id
  FROM public.profiles p
 WHERE LOWER(TRIM(et.responsible)) = LOWER(TRIM(p.name))
   AND et.responsible_id IS NULL
   AND et.responsible IS NOT NULL
   AND p.active = true;

-- cycle_phase_tasks.responsavel_nome
UPDATE public.cycle_phase_tasks cpt
   SET responsavel_id = p.id
  FROM public.profiles p
 WHERE LOWER(TRIM(cpt.responsavel_nome)) = LOWER(TRIM(p.name))
   AND cpt.responsavel_id IS NULL
   AND cpt.responsavel_nome IS NOT NULL
   AND p.active = true;

-- project_tasks.responsible
UPDATE public.project_tasks pt
   SET responsible_id = p.id
  FROM public.profiles p
 WHERE LOWER(TRIM(pt.responsible)) = LOWER(TRIM(p.name))
   AND pt.responsible_id IS NULL
   AND pt.responsible IS NOT NULL
   AND p.active = true;

-- =====================================================================
-- ETAPA 3 · Índices nas novas FKs (performance)
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_area_responsaveis_responsavel_id
  ON public.area_responsaveis (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_projects_leader_id
  ON public.projects (leader_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_responsible_id
  ON public.projects (responsible_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_tasks_responsible_id
  ON public.event_tasks (responsible_id);
CREATE INDEX IF NOT EXISTS idx_cycle_phase_tasks_responsavel_id
  ON public.cycle_phase_tasks (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_responsible_id
  ON public.project_tasks (responsible_id);

-- =====================================================================
-- ETAPA 4 · Comentários documentando a transição
-- =====================================================================
COMMENT ON COLUMN public.area_responsaveis.responsavel_id IS
  'UUID FK profiles(id) · canonico desde 2026-05-21. Coluna responsavel_nome (TEXT) mantida temporariamente · backend/frontend migram em PR follow-up.';

COMMENT ON COLUMN public.projects.leader_id IS
  'UUID FK profiles(id) · canonico desde 2026-05-21. Coluna leader (TEXT) sera removida em PR follow-up.';

COMMENT ON COLUMN public.projects.responsible_id IS
  'UUID FK profiles(id) · canonico desde 2026-05-21. Coluna responsible (TEXT) sera removida em PR follow-up.';

COMMENT ON COLUMN public.event_tasks.responsible_id IS
  'UUID FK profiles(id) · canonico desde 2026-05-21. Coluna responsible (TEXT) sera removida em PR follow-up.';

COMMENT ON COLUMN public.cycle_phase_tasks.responsavel_id IS
  'UUID FK profiles(id) · canonico desde 2026-05-21. Coluna responsavel_nome (TEXT) sera removida em PR follow-up.';

COMMENT ON COLUMN public.project_tasks.responsible_id IS
  'UUID FK profiles(id) · canonico desde 2026-05-21. Coluna responsible (TEXT) sera removida em PR follow-up.';

-- =====================================================================
-- ETAPA 5 · Diagnóstico · quantos rows não deram match
-- (RAISE NOTICE pra Marcos saber quem precisa de fix manual)
-- =====================================================================
DO $$
DECLARE
  v_area_unmatched INT;
  v_proj_leader_unmatched INT;
  v_proj_resp_unmatched INT;
  v_event_tasks_unmatched INT;
  v_cycle_unmatched INT;
  v_proj_tasks_unmatched INT;
BEGIN
  SELECT COUNT(*) INTO v_area_unmatched
    FROM public.area_responsaveis
    WHERE responsavel_nome IS NOT NULL AND responsavel_id IS NULL;

  SELECT COUNT(*) INTO v_proj_leader_unmatched
    FROM public.projects
    WHERE leader IS NOT NULL AND leader_id IS NULL AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_proj_resp_unmatched
    FROM public.projects
    WHERE responsible IS NOT NULL AND responsible_id IS NULL AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_event_tasks_unmatched
    FROM public.event_tasks
    WHERE responsible IS NOT NULL AND responsible_id IS NULL;

  SELECT COUNT(*) INTO v_cycle_unmatched
    FROM public.cycle_phase_tasks
    WHERE responsavel_nome IS NOT NULL AND responsavel_id IS NULL;

  SELECT COUNT(*) INTO v_proj_tasks_unmatched
    FROM public.project_tasks
    WHERE responsible IS NOT NULL AND responsible_id IS NULL;

  RAISE NOTICE '=== UNMATCHED (precisam fix manual ou novo profile) ===';
  RAISE NOTICE 'area_responsaveis: %', v_area_unmatched;
  RAISE NOTICE 'projects.leader: %', v_proj_leader_unmatched;
  RAISE NOTICE 'projects.responsible: %', v_proj_resp_unmatched;
  RAISE NOTICE 'event_tasks.responsible: %', v_event_tasks_unmatched;
  RAISE NOTICE 'cycle_phase_tasks.responsavel_nome: %', v_cycle_unmatched;
  RAISE NOTICE 'project_tasks.responsible: %', v_proj_tasks_unmatched;
END $$;
