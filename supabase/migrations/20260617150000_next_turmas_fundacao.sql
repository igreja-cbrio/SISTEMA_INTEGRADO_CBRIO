-- ============================================================================
-- Next vira TURMAS · fundação (coorte de 2 encontros, presença por encontro)
--
-- Substitui o modelo antigo (3 eventos soltos/mês) por:
--   next_turmas      → a coorte (ex.: "Next · jun/2026"), tipicamente 1/mês
--   next_encontros   → os 2 encontros da turma (numero 1|2, data, tema)
--   next_matriculas  → a pessoa na turma (+ flags ja_*/indicou_* p/ os KPIs next.*)
--   next_presencas   → presença por encontro (espelha mem_grupo_encontro_presencas)
--
-- ADITIVO: next_eventos / next_inscricoes / next_indicacoes ficam INTACTAS
-- (histórico + KPIs legados continuam lendo até a PR de religar os coletores).
-- As turmas começam do zero (decisão Marcos 2026-06-17 · sem migrar o histórico).
--
-- Decisões (Marcos 2026-06-17):
--   · turma_id NULLABLE em matriculas → fila de espera (inscreveu sem turma
--     aberta) + suporta "encaixar em outra turma" (re-slot = trocar turma_id).
--   · "formou" = presença nos 2 encontros (status guardado p/ a worklist de
--     incompletos: não-foi 0/2, faltou-1 1/2).
-- ============================================================================

-- 1. TURMAS ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.next_turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','encerrada','cancelada')),
  responsavel_id uuid,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_next_turmas_status
  ON public.next_turmas(status) WHERE deleted_at IS NULL;

-- 2. ENCONTROS (os 2 dias de aula) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.next_encontros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.next_turmas(id) ON DELETE CASCADE,
  numero int NOT NULL DEFAULT 1 CHECK (numero BETWEEN 1 AND 4),
  data date,
  tema text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turma_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_next_encontros_turma
  ON public.next_encontros(turma_id);

-- 3. MATRÍCULAS (pessoa na turma · carrega os flags dos KPIs next.*) ----------
CREATE TABLE IF NOT EXISTS public.next_matriculas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- nullable: matrícula sem turma = fila de espera (encaixe manual depois)
  turma_id uuid REFERENCES public.next_turmas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  sobrenome text,
  cpf text,
  telefone text,
  email text,
  data_nascimento date,
  observacoes text,
  membro_id uuid,
  -- snapshot pré-Next (mesma semântica de next_inscricoes · alimenta coletores)
  ja_batizado boolean DEFAULT false,
  ja_voluntario boolean DEFAULT false,
  ja_doador boolean DEFAULT false,
  -- indicações (a aba some, mas o dado/KPI continua)
  indicou_batismo boolean DEFAULT false,
  indicou_servir boolean DEFAULT false,
  indicou_grupo boolean DEFAULT false,
  indicou_dizimo boolean DEFAULT false,
  status text NOT NULL DEFAULT 'matriculado'
    CHECK (status IN ('matriculado','formado','incompleto','desistiu')),
  origem text NOT NULL DEFAULT 'formulario'
    CHECK (origem IN ('formulario','manual')),
  registered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_next_matriculas_turma
  ON public.next_matriculas(turma_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_next_matriculas_created
  ON public.next_matriculas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_next_matriculas_membro
  ON public.next_matriculas(membro_id);
-- fila de espera (sem turma) — listar rápido quem aguarda encaixe
CREATE INDEX IF NOT EXISTS idx_next_matriculas_fila
  ON public.next_matriculas(created_at) WHERE turma_id IS NULL AND deleted_at IS NULL;
-- dedup por turma (não impede a mesma pessoa em turmas diferentes ao longo do tempo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_matriculas_turma_cpf
  ON public.next_matriculas(turma_id, cpf)
  WHERE cpf IS NOT NULL AND turma_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_matriculas_turma_email
  ON public.next_matriculas(turma_id, email)
  WHERE email IS NOT NULL AND turma_id IS NOT NULL AND deleted_at IS NULL;

-- 4. PRESENÇAS por encontro --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.next_presencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encontro_id uuid NOT NULL REFERENCES public.next_encontros(id) ON DELETE CASCADE,
  matricula_id uuid NOT NULL REFERENCES public.next_matriculas(id) ON DELETE CASCADE,
  presente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encontro_id, matricula_id)
);
CREATE INDEX IF NOT EXISTS idx_next_presencas_encontro
  ON public.next_presencas(encontro_id);
CREATE INDEX IF NOT EXISTS idx_next_presencas_matricula
  ON public.next_presencas(matricula_id);

-- ----------------------------------------------------------------------------
-- RLS · leitura p/ quem tem integracao OU next (>=1) ou super-admin.
--       escrita só backend (service_role). Frontend nunca escreve direto.
-- ----------------------------------------------------------------------------
ALTER TABLE public.next_turmas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_encontros  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_presencas  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS next_turmas_read ON public.next_turmas;
CREATE POLICY next_turmas_read ON public.next_turmas FOR SELECT TO authenticated
  USING (public.current_user_module_level('integracao') >= 1
      OR public.current_user_module_level('next') >= 1
      OR public.is_super_admin());
DROP POLICY IF EXISTS next_turmas_service ON public.next_turmas;
CREATE POLICY next_turmas_service ON public.next_turmas FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS next_encontros_read ON public.next_encontros;
CREATE POLICY next_encontros_read ON public.next_encontros FOR SELECT TO authenticated
  USING (public.current_user_module_level('integracao') >= 1
      OR public.current_user_module_level('next') >= 1
      OR public.is_super_admin());
DROP POLICY IF EXISTS next_encontros_service ON public.next_encontros;
CREATE POLICY next_encontros_service ON public.next_encontros FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS next_matriculas_read ON public.next_matriculas;
CREATE POLICY next_matriculas_read ON public.next_matriculas FOR SELECT TO authenticated
  USING (public.current_user_module_level('integracao') >= 1
      OR public.current_user_module_level('next') >= 1
      OR public.is_super_admin());
DROP POLICY IF EXISTS next_matriculas_service ON public.next_matriculas;
CREATE POLICY next_matriculas_service ON public.next_matriculas FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS next_presencas_read ON public.next_presencas;
CREATE POLICY next_presencas_read ON public.next_presencas FOR SELECT TO authenticated
  USING (public.current_user_module_level('integracao') >= 1
      OR public.current_user_module_level('next') >= 1
      OR public.is_super_admin());
DROP POLICY IF EXISTS next_presencas_service ON public.next_presencas;
CREATE POLICY next_presencas_service ON public.next_presencas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Soft-delete · adiciona next_turmas e next_matriculas (PII) à whitelist SEM
-- reescrever a lista (lê a atual + união · idempotente · guard se a fn não existir).
-- ----------------------------------------------------------------------------
DO $$
DECLARE newlist text[];
BEGIN
  IF to_regprocedure('public.app_soft_deletable_tables()') IS NOT NULL THEN
    SELECT array(
      SELECT DISTINCT e
      FROM unnest(public.app_soft_deletable_tables() || ARRAY['next_turmas','next_matriculas']) AS e
      ORDER BY e
    ) INTO newlist;
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::text[] $f$',
      newlist
    );
  END IF;
END $$;

COMMENT ON TABLE public.next_turmas     IS 'Next · coorte (turma) de 2 encontros. Substitui o modelo de eventos soltos.';
COMMENT ON TABLE public.next_matriculas IS 'Next · pessoa matriculada na turma (turma_id NULL = fila). Carrega ja_*/indicou_* que os coletores next.* leem.';
