-- ============================================================================
-- Modulo Grupos · hierarquia (funcao, supervisor) + supervisao mensal
--
-- Marcos: "crie uma funcao para todos os membros (visitante, frequentador,
--          lider em treinamento, lider, supervisor, coordenador), uma coluna
--          na tabela de grupos vinculando todo grupo a um supervisor, e uma
--          tela de visualizacao por permissao... isso vai fazer com que
--          todos os dados sejam bem preenchidos pelo kpi"
--
-- Hierarquia:
--   coordenador
--      └── supervisor (acompanha N grupos)
--             └── lider de grupo + co_lider + lider_treinamento
--                    └── frequentador / visitante
--
-- Tabelas afetadas:
--   1. mem_grupo_membros.funcao (text) · 6 valores
--   2. mem_grupos.supervisor_id (uuid) · 1 supervisor por grupo
--   3. grupo_supervisao_visitas (nova) · datas das visitas do supervisor
--   4. grupo_supervisao_observacoes (nova) · obs mensal por grupo
--
-- KPIs que esses dados alimentam:
--   - lideres_treinados      · count membros funcao='lider_treinamento'
--   - lideres_acompanhados   · count grupos visitados no mes pelo supervisor
--   - grupos_ativos          · ja existe
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. funcao no membro do grupo
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.grupo_funcao AS ENUM (
    'visitante',
    'frequentador',
    'lider_treinamento',
    'lider',
    'co_lider',
    'supervisor',
    'coordenador'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.mem_grupo_membros
  ADD COLUMN IF NOT EXISTS funcao public.grupo_funcao NOT NULL DEFAULT 'frequentador';

CREATE INDEX IF NOT EXISTS idx_grupo_membros_funcao
  ON public.mem_grupo_membros (funcao)
  WHERE saiu_em IS NULL;

COMMENT ON COLUMN public.mem_grupo_membros.funcao IS
  'Papel da pessoa no grupo · alimenta KPIs de lideranca';

-- ----------------------------------------------------------------------------
-- 2. supervisor_id no grupo
--    Aponta pra mem_membros (a pessoa que supervisiona) · pode ser NULL
-- ----------------------------------------------------------------------------
ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS supervisor_id uuid
    REFERENCES public.mem_membros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mem_grupos_supervisor
  ON public.mem_grupos (supervisor_id)
  WHERE supervisor_id IS NOT NULL AND ativo = true;

COMMENT ON COLUMN public.mem_grupos.supervisor_id IS
  'Supervisor responsavel por acompanhar o grupo · vinculo a mem_membros';

-- ----------------------------------------------------------------------------
-- 3. grupo_supervisao_visitas · 1 row por visita do supervisor ao grupo
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupo_supervisao_visitas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id        uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  supervisor_id   uuid NOT NULL REFERENCES public.mem_membros(id),
  data_visita     date NOT NULL DEFAULT CURRENT_DATE,
  observacao      text,
  registrado_por  uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisao_visitas_grupo
  ON public.grupo_supervisao_visitas (grupo_id, data_visita DESC);

CREATE INDEX IF NOT EXISTS idx_supervisao_visitas_supervisor
  ON public.grupo_supervisao_visitas (supervisor_id, data_visita DESC);

ALTER TABLE public.grupo_supervisao_visitas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "supervisao_visitas_read"
    ON public.grupo_supervisao_visitas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "supervisao_visitas_write"
    ON public.grupo_supervisao_visitas FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "supervisao_visitas_update"
    ON public.grupo_supervisao_visitas FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "supervisao_visitas_delete"
    ON public.grupo_supervisao_visitas FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4. grupo_supervisao_observacoes · 1 row por (grupo, mes-ano)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupo_supervisao_observacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id        uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  supervisor_id   uuid NOT NULL REFERENCES public.mem_membros(id),
  periodo         text NOT NULL,        -- formato YYYY-MM (mensal)
  observacao      text NOT NULL,
  registrado_por  uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_observacao_grupo_periodo UNIQUE (grupo_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_supervisao_obs_grupo
  ON public.grupo_supervisao_observacoes (grupo_id, periodo DESC);

ALTER TABLE public.grupo_supervisao_observacoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "supervisao_obs_read"
    ON public.grupo_supervisao_observacoes FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "supervisao_obs_write"
    ON public.grupo_supervisao_observacoes FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "supervisao_obs_update"
    ON public.grupo_supervisao_observacoes FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "supervisao_obs_delete"
    ON public.grupo_supervisao_observacoes FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 5. View consolidada · grupo + supervisor + lider + ultimas atividades
--    Usada pela tela /grupos/supervisao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_grupos_supervisao AS
SELECT
  g.id, g.nome, g.categoria, g.local, g.dia_semana, g.horario,
  g.bairro, g.ativo, g.temporada, g.status_temporada,
  g.lider_id,
  l.nome AS lider_nome,
  g.supervisor_id,
  s.nome AS supervisor_nome,
  (SELECT count(*) FROM public.mem_grupo_membros m
     WHERE m.grupo_id = g.id AND m.saiu_em IS NULL) AS total_membros,
  (SELECT count(*) FROM public.mem_grupo_membros m
     WHERE m.grupo_id = g.id AND m.saiu_em IS NULL
       AND m.funcao = 'lider_treinamento') AS total_lider_treinamento,
  (SELECT max(data_visita) FROM public.grupo_supervisao_visitas v
     WHERE v.grupo_id = g.id) AS ultima_visita,
  (SELECT count(*) FROM public.grupo_supervisao_visitas v
     WHERE v.grupo_id = g.id
       AND v.data_visita >= date_trunc('month', CURRENT_DATE)::date) AS visitas_mes_atual
FROM public.mem_grupos g
LEFT JOIN public.mem_membros l ON l.id = g.lider_id
LEFT JOIN public.mem_membros s ON s.id = g.supervisor_id
WHERE g.ativo = true;

COMMENT ON VIEW public.vw_grupos_supervisao IS
  'Visao consolidada · um grupo por linha com supervisor, lider, contagens e ultima visita';

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT count(*) FROM mem_grupo_membros WHERE funcao IS NOT NULL;
-- SELECT count(*) FROM mem_grupos WHERE supervisor_id IS NOT NULL;
-- SELECT * FROM vw_grupos_supervisao LIMIT 5;
-- ============================================================================
