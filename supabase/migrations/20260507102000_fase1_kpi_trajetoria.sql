-- ============================================================================
-- FASE 1 · Trajetoria de Metas (checkpoints intermediarios por KPI)
--
-- Cada KPI tem uma meta final (ja em kpi_indicadores_taticos.meta_descricao).
-- Para evitar "crescimento falso" (numero cresce mas abaixo do necessario
-- para atingir a meta), criamos uma trajetoria com checkpoints por periodo.
--
-- Exemplo:
--   KPI "Frequencia AMI" · meta final 2.500 · trajetoria:
--      jan: 2.300
--      fev: 2.350
--      mar: 2.400
--      abr: 2.450
--      mai: 2.500 (alcanca meta)
--
-- Status do KPI passa a comparar contra o checkpoint do periodo, nao so a meta:
--   Adiantado : valor >= proximo checkpoint
--   No alvo   : valor >= checkpoint do periodo
--   Atras     : 90% <= valor < checkpoint
--   Critico   : valor < 90% do checkpoint
--
-- Decisao: tabela separada (nao JSON) para permitir indexar, editar individualmente,
-- e ter historico de quem alterou cada checkpoint e quando.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kpi_trajetoria (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id              text NOT NULL REFERENCES public.kpi_indicadores_taticos(id) ON DELETE CASCADE,
  periodo_referencia  text NOT NULL,
  meta_valor          numeric,
  meta_texto          text,
  observacao          text,
  ativa               boolean NOT NULL DEFAULT true,
  criado_por_user_id  uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- 1 trajetoria ativa por (kpi, periodo) — permite historico via ativa=false
  CONSTRAINT uq_kpi_trajetoria_kpi_periodo_ativa
    UNIQUE (kpi_id, periodo_referencia, ativa) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_kpi_trajetoria_kpi ON public.kpi_trajetoria (kpi_id) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_kpi_trajetoria_periodo ON public.kpi_trajetoria (periodo_referencia) WHERE ativa = true;

ALTER TABLE public.kpi_trajetoria ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "kpi_trajetoria_read_authenticated" ON public.kpi_trajetoria FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "kpi_trajetoria_write_by_area" ON public.kpi_trajetoria FOR ALL TO authenticated
    USING (
      public.can_edit_kpi_area(
        (SELECT area FROM public.kpi_indicadores_taticos WHERE id = kpi_trajetoria.kpi_id)
      )
    )
    WITH CHECK (
      public.can_edit_kpi_area(
        (SELECT area FROM public.kpi_indicadores_taticos WHERE id = kpi_trajetoria.kpi_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Trigger: updated_at automatico
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_kpi_trajetoria_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_kpi_trajetoria_updated_at_set ON public.kpi_trajetoria;
CREATE TRIGGER tg_kpi_trajetoria_updated_at_set
  BEFORE UPDATE ON public.kpi_trajetoria
  FOR EACH ROW EXECUTE FUNCTION public.tg_kpi_trajetoria_updated_at();

-- ----------------------------------------------------------------------------
-- View: trajetoria + status calculado vs ultimo registro
-- Usada pelo /painel e /minha-area para mostrar Adiantado/No alvo/Atras/Critico
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_kpi_trajetoria_atual AS
WITH ultimo AS (
  SELECT DISTINCT ON (indicador_id)
    indicador_id, periodo_referencia, valor_realizado, data_preenchimento
  FROM public.kpi_registros
  WHERE valor_realizado IS NOT NULL
  ORDER BY indicador_id, data_preenchimento DESC
)
SELECT
  k.id AS kpi_id,
  k.indicador,
  k.area,
  k.periodicidade,
  t.periodo_referencia AS checkpoint_periodo,
  t.meta_valor AS checkpoint_meta,
  u.periodo_referencia AS ultimo_periodo,
  u.valor_realizado AS ultimo_valor,
  CASE
    WHEN u.valor_realizado IS NULL OR t.meta_valor IS NULL THEN 'sem_dado'
    WHEN u.valor_realizado >= t.meta_valor THEN 'no_alvo'
    WHEN u.valor_realizado >= t.meta_valor * 0.9 THEN 'atras'
    ELSE 'critico'
  END AS status_trajetoria,
  CASE
    WHEN u.valor_realizado IS NULL OR t.meta_valor IS NULL OR t.meta_valor = 0 THEN NULL
    ELSE round((u.valor_realizado / t.meta_valor) * 100, 1)
  END AS percentual_meta
FROM public.kpi_indicadores_taticos k
LEFT JOIN public.kpi_trajetoria t
       ON t.kpi_id = k.id
      AND t.ativa = true
LEFT JOIN ultimo u ON u.indicador_id = k.id
WHERE k.ativo = true;

GRANT SELECT ON public.vw_kpi_trajetoria_atual TO authenticated, service_role;

COMMENT ON TABLE public.kpi_trajetoria IS 'Checkpoints intermediarios de meta por KPI. Permite distinguir crescimento real (atinge checkpoint) de crescimento falso (cresceu mas abaixo do necessario).';
