-- Fase 3a · Jornada 180 como estrutura PRÓPRIA de turmas DENTRO de Cuidados.
-- J180 lida com dado sensível (vícios/problemas) e é responsabilidade de Cuidados,
-- separado dos grupos de conexão. Espelha a máquina de grupos (turma → líder →
-- participantes → encontros → presenças), mas com RLS scoped ao módulo 'cuidados'
-- (não vaza pro time de Grupos) e fora dos KPIs tradicionais de grupos.
-- Áreas: ami/sede/online (kids/adolescentes não participam).
-- Soft-delete (deleted_at) é feito pelo backend via UPDATE (service_role) — a tabela
-- não entra na whitelist app_soft_deletable_tables (o delete sempre passa pelo backend).

-- 1) Turmas
CREATE TABLE IF NOT EXISTS public.cui_j180_turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  area text NOT NULL DEFAULT 'sede' CHECK (area IN ('ami','sede','online')),
  lider_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  lider_nome text,
  temporada text,
  dia_semana smallint CHECK (dia_semana BETWEEN 0 AND 6),
  horario time,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cui_j180_turmas_ativa
  ON public.cui_j180_turmas (area) WHERE deleted_at IS NULL AND ativo = true;

-- 2) Participantes (roster · podem não ser membros → membro_id nullable)
CREATE TABLE IF NOT EXISTS public.cui_j180_turma_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.cui_j180_turmas(id) ON DELETE CASCADE,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  telefone text,
  entrou_em date NOT NULL DEFAULT CURRENT_DATE,
  saiu_em date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cui_j180_turma_membros_turma
  ON public.cui_j180_turma_membros (turma_id) WHERE saiu_em IS NULL;

-- 3) Encontros
CREATE TABLE IF NOT EXISTS public.cui_j180_encontros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.cui_j180_turmas(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  tema text,
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cui_j180_encontros_turma_data
  ON public.cui_j180_encontros (turma_id, data DESC) WHERE deleted_at IS NULL;

-- 4) Presenças (por participante do roster · cobre não-membros)
CREATE TABLE IF NOT EXISTS public.cui_j180_encontro_presencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encontro_id uuid NOT NULL REFERENCES public.cui_j180_encontros(id) ON DELETE CASCADE,
  turma_membro_id uuid NOT NULL REFERENCES public.cui_j180_turma_membros(id) ON DELETE CASCADE,
  presente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encontro_id, turma_membro_id)
);
CREATE INDEX IF NOT EXISTS idx_cui_j180_presencas_encontro
  ON public.cui_j180_encontro_presencas (encontro_id);

-- RLS · scoped ao módulo Cuidados (read≥1 · write≥3 · delete super-admin · service_role bypassa)
ALTER TABLE public.cui_j180_turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_j180_turma_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_j180_encontros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_j180_encontro_presencas ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cui_j180_turmas','cui_j180_turma_membros','cui_j180_encontros','cui_j180_encontro_presencas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_service ON public.%1$s;', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (public.current_user_module_level(''cuidados'') >= 1);', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level(''cuidados'') >= 3);', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.current_user_module_level(''cuidados'') >= 3) WITH CHECK (public.current_user_module_level(''cuidados'') >= 3);', t);
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated USING (public.is_super_admin());', t);
    EXECUTE format('CREATE POLICY %1$s_service ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.cui_j180_turmas IS 'Turmas da Jornada 180 (geridas por Cuidados · dado sensível · separado dos grupos de conexão · áreas ami/sede/online)';
