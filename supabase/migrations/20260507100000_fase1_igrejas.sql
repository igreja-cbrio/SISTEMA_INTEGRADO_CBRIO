-- ============================================================================
-- FASE 1 · Estrutura de Igrejas (CBRio Sede + Online + igrejas CBA)
--
-- Permite:
--   - Distinguir membros da CBRio Sede, do Online e das igrejas acompanhadas
--     pela CBA (que sao igrejas externas, nao plantacoes nossas)
--   - NSM segmentada (central / cbrio / online / cba)
--   - Filtragem por igreja em todos os modulos de gestao
--
-- Decisao: tabela `igrejas` (nao campo enum) para permitir crescimento
-- dinamico sem migration nova quando entrar uma nova igreja CBA.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela igrejas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.igrejas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  tipo            text NOT NULL CHECK (tipo IN ('sede', 'online', 'cba_acompanhada')),
  pastor_responsavel_id uuid REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL,
  cidade          text,
  estado          text,
  data_inicio     date,
  observacoes     text,
  ativa           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_igrejas_tipo ON public.igrejas (tipo) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_igrejas_ativa ON public.igrejas (ativa);

ALTER TABLE public.igrejas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "igrejas_read_authenticated" ON public.igrejas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "igrejas_write_authenticated" ON public.igrejas FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Seed: CBRio Sede + CBRio Online (sempre existem)
-- ----------------------------------------------------------------------------
INSERT INTO public.igrejas (id, nome, slug, tipo, cidade, estado, ativa, observacoes)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'CBRio Sede',   'cbrio-sede',   'sede',   'Rio de Janeiro', 'RJ', true, 'Igreja-mae · culto presencial dominical · agregado de adultos'),
  ('00000000-0000-0000-0000-000000000002', 'CBRio Online', 'cbrio-online', 'online', 'Rio de Janeiro', 'RJ', true, 'Comunidade digital · culto online + grupos remotos')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- mem_membros: vincular a igreja
-- Default = CBRio Sede (00000000-0000-0000-0000-000000000001)
-- Existing rows recebem esse valor automaticamente
-- ----------------------------------------------------------------------------
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS igreja_id uuid REFERENCES public.igrejas(id) ON DELETE SET NULL;

UPDATE public.mem_membros
   SET igreja_id = '00000000-0000-0000-0000-000000000001'
 WHERE igreja_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_mem_membros_igreja ON public.mem_membros (igreja_id);

-- ----------------------------------------------------------------------------
-- int_visitantes: vincular a igreja (visitante chega num culto especifico)
-- Default = CBRio Sede; Online = quando origem online ou explicitado
-- ----------------------------------------------------------------------------
ALTER TABLE public.int_visitantes
  ADD COLUMN IF NOT EXISTS igreja_id uuid REFERENCES public.igrejas(id) ON DELETE SET NULL;

UPDATE public.int_visitantes
   SET igreja_id = '00000000-0000-0000-0000-000000000001'
 WHERE igreja_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_int_visitantes_igreja ON public.int_visitantes (igreja_id);

-- ----------------------------------------------------------------------------
-- View helper: igrejas agrupadas por tipo (usada no calculo NSM segmentada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_igrejas_por_tipo AS
SELECT
  tipo,
  count(*) FILTER (WHERE ativa = true) AS total_ativas,
  array_agg(id) FILTER (WHERE ativa = true) AS ids,
  array_agg(nome ORDER BY nome) FILTER (WHERE ativa = true) AS nomes
FROM public.igrejas
GROUP BY tipo;

GRANT SELECT ON public.vw_igrejas_por_tipo TO authenticated, service_role;

COMMENT ON TABLE public.igrejas IS 'CBRio Sede + Online + igrejas externas acompanhadas pela CBA. Usado em NSM segmentada e gestao de KPIs por igreja.';
COMMENT ON COLUMN public.mem_membros.igreja_id IS 'A qual igreja este membro pertence. Default CBRio Sede. Para membros das igrejas CBA, FK para a igreja externa correspondente.';
COMMENT ON COLUMN public.int_visitantes.igreja_id IS 'Em qual igreja o visitante apareceu. Permite NSM por igreja de chegada.';
