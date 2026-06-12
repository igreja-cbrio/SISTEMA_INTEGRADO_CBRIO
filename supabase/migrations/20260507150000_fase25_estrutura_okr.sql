-- ============================================================================
-- FASE 2.5A · Estrutura formal de OKR (Direcionador → Objetivo Geral → KPI + KRs)
--
-- Hoje: kpi_indicadores_taticos eh a unica tabela.
-- Agora: amarrar formalmente a hierarquia da planilha "Metas e Indicadores 2026":
--
--   direcionadores ("UNIDADE")
--     └─ kpi_objetivos_gerais (25 objetivos: "Aumentar batismos", etc)
--           └─ kpi_indicadores_taticos (148 KPIs especificos por area)
--
--   kpi_krs:
--     ligados a OBJETIVO GERAL → KRs gerais (medem o sucesso do objetivo agregado)
--     ligados a KPI            → KRs especificos (analises que triangulam o KPI)
--
-- A planilha NAO traz KRs — Marcos vai adicionar via UI depois (Fase 2.5B).
-- A estrutura ja fica preparada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- direcionadores
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.direcionadores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL UNIQUE,
  descricao   text,
  ordem       int NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.direcionadores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "direcionadores_read" ON public.direcionadores FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "direcionadores_write_admin" ON public.direcionadores FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- kpi_objetivos_gerais
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpi_objetivos_gerais (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direcionador_id   uuid REFERENCES public.direcionadores(id) ON DELETE SET NULL,
  nome              text NOT NULL,
  descricao         text,
  indicador_geral   text,                          -- como medir no agregado
  valores           text[] NOT NULL DEFAULT '{}',  -- valores da Jornada que este obj alimenta
  ordem             int NOT NULL DEFAULT 99,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_objetivo_geral_nome UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS idx_obj_geral_direcionador ON public.kpi_objetivos_gerais (direcionador_id);
CREATE INDEX IF NOT EXISTS idx_obj_geral_ativo ON public.kpi_objetivos_gerais (ativo) WHERE ativo = true;

ALTER TABLE public.kpi_objetivos_gerais ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "obj_geral_read" ON public.kpi_objetivos_gerais FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "obj_geral_write_admin" ON public.kpi_objetivos_gerais FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_obj_geral_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS tg_obj_geral_set_updated_at ON public.kpi_objetivos_gerais;
CREATE TRIGGER tg_obj_geral_set_updated_at BEFORE UPDATE ON public.kpi_objetivos_gerais
  FOR EACH ROW EXECUTE FUNCTION public.tg_obj_geral_updated_at();

-- ----------------------------------------------------------------------------
-- kpi_krs (KRs gerais OU KRs especificos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpi_krs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objetivo_geral_id   uuid REFERENCES public.kpi_objetivos_gerais(id) ON DELETE CASCADE,
  kpi_id              text REFERENCES public.kpi_indicadores_taticos(id) ON DELETE CASCADE,
  titulo              text NOT NULL,
  descricao           text,
  formula_calculo     text,
  meta_valor          numeric,
  meta_texto          text,
  unidade             text,
  ordem               int NOT NULL DEFAULT 99,
  ativo               boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_kr_parent CHECK (
    (objetivo_geral_id IS NOT NULL AND kpi_id IS NULL) OR
    (objetivo_geral_id IS NULL AND kpi_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_kr_obj ON public.kpi_krs (objetivo_geral_id) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_kr_kpi ON public.kpi_krs (kpi_id) WHERE ativo = true;

ALTER TABLE public.kpi_krs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "kpi_krs_read" ON public.kpi_krs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "kpi_krs_write_admin" ON public.kpi_krs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS tg_kr_set_updated_at ON public.kpi_krs;
CREATE OR REPLACE FUNCTION public.tg_kr_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tg_kr_set_updated_at BEFORE UPDATE ON public.kpi_krs
  FOR EACH ROW EXECUTE FUNCTION public.tg_kr_updated_at();

-- ----------------------------------------------------------------------------
-- Ampliar kpi_indicadores_taticos
--   - objetivo_geral_id: FK para o agrupamento
--   - memoria_calculo:   formula textual (vinda da planilha)
--   - observacoes:       observacoes adicionais
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS objetivo_geral_id uuid REFERENCES public.kpi_objetivos_gerais(id) ON DELETE SET NULL;

ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS memoria_calculo text;

ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS observacoes text;

CREATE INDEX IF NOT EXISTS idx_kpi_obj_geral ON public.kpi_indicadores_taticos (objetivo_geral_id) WHERE ativo = true;

-- ----------------------------------------------------------------------------
-- Seed: direcionador "UNIDADE"
-- ----------------------------------------------------------------------------
INSERT INTO public.direcionadores (id, nome, descricao, ordem, ativo)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'UNIDADE',
   'Direcionador estrategico macro da CBRio 2026: novos convertidos engajados em ao menos 1 valor em ate 60 dias da decisao.',
   1, true)
ON CONFLICT (nome) DO NOTHING;

COMMENT ON TABLE public.direcionadores IS 'Direcionadores estrategicos macro (1 por ano/ciclo: ex UNIDADE 2026).';
COMMENT ON TABLE public.kpi_objetivos_gerais IS 'Objetivos gerais (~25 da planilha): "Aumentar batismos", "Aumentar dizimistas", etc. Agrupam KPIs especificos por area.';
COMMENT ON TABLE public.kpi_krs IS 'Key Results: ligados a objetivo geral (KR geral, ~3-5) ou a KPI (KR especifico, analises que triangulam o KPI).';
COMMENT ON COLUMN public.kpi_indicadores_taticos.memoria_calculo IS 'Formula textual de como o indicador eh calculado (vinda da planilha de Marcos).';
COMMENT ON COLUMN public.kpi_indicadores_taticos.objetivo_geral_id IS 'A qual objetivo geral este KPI pertence. Permite cascata automatica.';
