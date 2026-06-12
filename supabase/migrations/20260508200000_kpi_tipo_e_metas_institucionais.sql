-- ============================================================================
-- KPI · tipo (qualitativo/quantitativo) + tabela de metas institucionais
--
-- Marcos: existem 2 tipos de KPI:
--   · Qualitativo · melhoria de processo (solicitacoes atendidas, qualidade,
--     NPS, alocacao, % corretos)
--   · Quantitativo · aumento de numero (frequencia, conversoes, batismos,
--     doacoes, voluntarios)
--
-- Em alguns anos a meta institucional e generica (ex: 2026 = +30% em todos
-- os quantitativos). Esta migration cria:
--   1. Coluna tipo_kpi
--   2. Tabela kpi_metas_institucionais (1 linha por (tipo, ano))
--   3. Seed heuristico classificando os 153 KPIs ativos
--   4. Seed da meta institucional 2026 quantitativo = +30%
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna tipo_kpi em kpi_indicadores_taticos
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS tipo_kpi text
  CHECK (tipo_kpi IS NULL OR tipo_kpi IN ('qualitativo', 'quantitativo'));

CREATE INDEX IF NOT EXISTS idx_kpi_tipo ON public.kpi_indicadores_taticos (tipo_kpi) WHERE ativo = true;

COMMENT ON COLUMN public.kpi_indicadores_taticos.tipo_kpi IS
  'qualitativo (melhoria de processo: NPS, % atendidos, qualidade) ou quantitativo (crescimento absoluto: frequencia, conversoes, doacoes).';

-- ----------------------------------------------------------------------------
-- 2. Tabela kpi_metas_institucionais
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpi_metas_institucionais (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_kpi        text NOT NULL CHECK (tipo_kpi IN ('qualitativo', 'quantitativo')),
  ano             int NOT NULL,
  meta_descricao  text NOT NULL,
  meta_valor      numeric,
  unidade         text,
  observacoes     text,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_kpi, ano)
);

ALTER TABLE public.kpi_metas_institucionais ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "metas_inst_read" ON public.kpi_metas_institucionais FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "metas_inst_write_admin" ON public.kpi_metas_institucionais FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.kpi_metas_institucionais IS
  'Meta institucional global por tipo de KPI e ano. Ex: 2026 quantitativo = +30%, 2026 qualitativo = >=90% atendidas.';

-- ----------------------------------------------------------------------------
-- 3. Seed heuristico · classificar 153 KPIs ativos
--
-- Regras (ordem importa · primeira que casa vence):
--   QUALITATIVO se descricao/indicador contem:
--     · solicitacoes / atendido / atendidas
--     · capelania / aconselhamento
--     · NPS / satisfacao / qualidade
--     · check-in / checkin / corretamente
--     · pararam de servir / inativos / recuperados
--     · alocados / acompanhados
--     · recorrencia
--     · grupo c / qualidade dos doadores
--   QUANTITATIVO · default (resto)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET tipo_kpi = 'qualitativo',
       updated_at = now()
 WHERE ativo = true
   AND tipo_kpi IS NULL
   AND (
        lower(coalesce(descricao,'')) ~ '(solicita|atendid|capelania|aconselh|nps|satisfa|qualidade|checkin|check-in|corretamente|pararam de servir|inativos|recupera|alocad|acompanhad|recorrenc|grupo c)'
     OR lower(coalesce(indicador,'')) ~ '(solicita|atendid|capelania|aconselh|nps|satisfa|qualidade|checkin|check-in|corretamente|pararam de servir|inativos|recupera|alocad|acompanhad|recorrenc|grupo c)'
   );

UPDATE public.kpi_indicadores_taticos
   SET tipo_kpi = 'quantitativo',
       updated_at = now()
 WHERE ativo = true
   AND tipo_kpi IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Seed das metas institucionais 2026
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_metas_institucionais (tipo_kpi, ano, meta_descricao, meta_valor, unidade, observacoes)
VALUES
  ('quantitativo', 2026, '+30% em todos os indicadores quantitativos vs 2025', 30, '%', 'Meta institucional do ano · aumento geral de 30%'),
  ('qualitativo',  2026, '>=90% de eficiencia em todos os processos', 90, '%', 'Meta institucional · processos qualitativos com pelo menos 90% de execucao')
ON CONFLICT (tipo_kpi, ano) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Trigger updated_at
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_metas_inst_set_updated_at ON public.kpi_metas_institucionais;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_metas_inst()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_metas_inst_set_updated_at
  BEFORE UPDATE ON public.kpi_metas_institucionais
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_metas_inst();

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT tipo_kpi, count(*) FROM kpi_indicadores_taticos WHERE ativo = true GROUP BY tipo_kpi;
-- Espera: 2 linhas (qualitativo, quantitativo) somando 153

-- SELECT * FROM kpi_metas_institucionais ORDER BY ano DESC, tipo_kpi;
-- Espera: 2 linhas (2026 qual + quant)
