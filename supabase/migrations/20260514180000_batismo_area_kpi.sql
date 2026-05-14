-- ============================================================================
-- Vincula batismo a area_kpi · permite cascata por campus
--
-- Marcos: "Sobre o batismo, acho que vale uma opcao de preencher nao
--          obrigatoria, se ele preencher tudo bem, se nao vai como Sede,
--          ai coloca. (AMI, Bridge, Online, CBRio Domingo)"
--
-- Mapeamento de label → area_kpi:
--   "CBRio Domingo" → 'sede'
--   "AMI"           → 'ami'
--   "Bridge"        → 'bridge'
--   "Online"        → 'online'
--   (Kids fica fora · batismo infantil tem outro fluxo via mem_trilha_valores)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna area_kpi · NOT NULL com default 'sede' · backfill automatico
-- ----------------------------------------------------------------------------
ALTER TABLE public.batismo_inscricoes
  ADD COLUMN IF NOT EXISTS area_kpi text NOT NULL DEFAULT 'sede';

-- CHECK constraint · so os 5 valores validos (kids incluido pra futuro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'batismo_inscricoes_area_kpi_check'
       AND conrelid = 'public.batismo_inscricoes'::regclass
  ) THEN
    ALTER TABLE public.batismo_inscricoes
      ADD CONSTRAINT batismo_inscricoes_area_kpi_check
        CHECK (area_kpi IN ('kids', 'sede', 'bridge', 'ami', 'online'));
  END IF;
END $$;

COMMENT ON COLUMN public.batismo_inscricoes.area_kpi IS
  'Campus onde a pessoa se batiza · alimenta KPIs batismos.<area> · default sede';

-- ----------------------------------------------------------------------------
-- 2. Atualiza vw_batismo_historico_anual · expoe area_kpi pra historico filtrado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_batismo_historico_anual AS
SELECT
  EXTRACT(YEAR FROM COALESCE(data_batismo, created_at::date))::int AS ano,
  area_kpi,
  COUNT(*)::int AS total_batismos
FROM public.batismo_inscricoes
WHERE status = 'realizado'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- ----------------------------------------------------------------------------
-- 3. Liga 4 KPIs de batismo por area aos coletores
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'batismos.ami', updated_at = now()
 WHERE id = 'AMI-04' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'batismos.bridge', updated_at = now()
 WHERE id = 'BRG-21' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'batismos.sede', updated_at = now()
 WHERE id = 'SED-20' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'batismos.online', updated_at = now()
 WHERE id = 'ONL-14' AND fonte_auto IS NULL;

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT area_kpi, count(*) FROM batismo_inscricoes GROUP BY 1;
--     Espera: maior parte em 'sede' (backfill)
--
--   SELECT * FROM vw_batismo_historico_anual;
--     Espera: 1 linha por (ano, area_kpi)
--
--   SELECT id, fonte_auto FROM kpi_indicadores_taticos
--    WHERE id IN ('AMI-04','BRG-21','SED-20','ONL-14');
--     Espera: todos com fonte_auto definido
-- ============================================================================
