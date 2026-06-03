-- ============================================================================
-- Frente B1 · KR medido pelo KPI (sem entrada manual) (2026-06-03)
-- ============================================================================
-- Marcos: "a ideia do KR é ser respondido pelo KPI central do indicador · nada
-- de entrada manual". Mecanismo: cada KR aponta pra um KPI tático que o mede
-- (fonte_kpi_id) e o realizado = ultimo_valor desse KPI (vw_kpi_trajetoria_atual).
--
-- Esta migration cria a coluna + liga os 3 marcos da jornada (Frente A) aos
-- seus KPIs por área. O wiring dos demais objetivos medidos + a remoção dos KRs
-- que nenhum KPI responde vêm em passo seguinte (proposta de triagem).
-- ============================================================================

ALTER TABLE public.kpi_krs
  ADD COLUMN IF NOT EXISTS fonte_kpi_id text REFERENCES public.kpi_indicadores_taticos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.kpi_krs.fonte_kpi_id IS
  'KPI tático que MEDE este KR · realizado = ultimo_valor do KPI (vw_kpi_trajetoria_atual). KR sem fonte_kpi_id ainda não é medido.';

CREATE INDEX IF NOT EXISTS idx_kr_fonte ON public.kpi_krs(fonte_kpi_id) WHERE ativo = true;

-- ----------------------------------------------------------------------------
-- Batismo ≤90d · KRs específicos por área já existem → liga ao X-BAT90
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET fonte_kpi_id = CASE area WHEN 'ami' THEN 'AMI-BAT90' WHEN 'bridge' THEN 'BRG-BAT90' WHEN 'online' THEN 'ONL-BAT90' WHEN 'sede' THEN 'SED-BAT90' END,
       updated_at = now()
 WHERE objetivo_geral_id = 'ac906f19-970a-d651-8c84-28f02f01a923'
   AND titulo ILIKE '%batizados em <=90%'
   AND area IN ('ami','bridge','online','sede');

-- ----------------------------------------------------------------------------
-- Reunião aceita · KRs específicos do objetivo "atendidos" → liga ao KPI religado
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET fonte_kpi_id = CASE area WHEN 'ami' THEN 'AMI-21' WHEN 'bridge' THEN 'BRG-19' WHEN 'online' THEN 'ONL-04' WHEN 'sede' THEN 'SED-17' END,
       updated_at = now()
 WHERE objetivo_geral_id = '5ffafa58-a8ed-d248-a410-c4c8ffd69c14'
   AND titulo ILIKE '%aceitam a reunião%'
   AND area IN ('ami','bridge','online','sede');

-- ----------------------------------------------------------------------------
-- Next ≤90d · o KR geral foi criado na Frente A · cascateia em específicos por
-- área (espelho do batismo) e já liga cada um ao X-NEXT90.
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_krs
  (objetivo_geral_id, titulo, descricao, formula_calculo, meta_valor, meta_texto,
   unidade, ordem, ativo, area, kr_pai_id, fonte_kpi_id)
SELECT pai.objetivo_geral_id, pai.titulo,
       COALESCE(pai.descricao,'') || ' · Filtro: ' || a.area,
       pai.formula_calculo, pai.meta_valor, pai.meta_texto, pai.unidade, pai.ordem,
       true, a.area, pai.id, a.kpi
  FROM public.kpi_krs pai
  CROSS JOIN (VALUES ('ami','AMI-NEXT90'),('bridge','BRG-NEXT90'),('online','ONL-NEXT90'),('sede','SED-NEXT90')) AS a(area, kpi)
 WHERE pai.objetivo_geral_id = '68c17f72-72a3-2369-8d30-dc1f9db88a47'
   AND pai.titulo ILIKE '%Next em <=90 dias%'
   AND pai.area IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.kpi_krs c WHERE c.kr_pai_id = pai.id AND c.area = a.area
   );

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT objetivo_geral_id, titulo, area, fonte_kpi_id FROM kpi_krs
--    WHERE fonte_kpi_id IS NOT NULL ORDER BY objetivo_geral_id, area;
--   -- esperado: 12 KRs ligados (4 batismo + 4 reunião + 4 Next)
-- ============================================================================
