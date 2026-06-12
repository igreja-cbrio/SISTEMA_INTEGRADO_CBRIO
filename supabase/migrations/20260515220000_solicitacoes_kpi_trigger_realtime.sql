-- ============================================================================
-- Solicitacoes -> KPIs ADM · trigger automatico de recalculo
--
-- Liga a tabela `solicitacoes` aos KPIs ADM-* (criados na migration
-- 20260512140000_kpis_adm_operacionais.sql). Antes desta migration, os
-- KPIs so eram recalculados manualmente ao rodar a propria migration de
-- criacao dos KPIs. Agora qualquer INSERT/UPDATE/DELETE em solicitacoes
-- dispara recalculo dos KPIs ADM da area_responsavel para os periodos
-- (mensal/trimestral) que cobrem created_at, respondido_em e concluido_em.
--
-- Helpers:
--   - kpi_adm_data_to_periodo(periodicidade, data)
--   - recalcular_kpis_adm_para_area_datas(area, datas[])
--   - tg_solicitacoes_recalc_kpis() · funcao do trigger
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. data -> string de periodo (formato aceito por _kpi_periodo_dates)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_adm_data_to_periodo(
  p_periodicidade text,
  p_data date
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_data IS NULL THEN RETURN NULL; END IF;
  RETURN CASE p_periodicidade
    WHEN 'mensal'     THEN to_char(p_data, 'YYYY-MM')
    WHEN 'trimestral' THEN to_char(p_data, 'YYYY') || '-Q' ||
                            ((extract(month from p_data)::int - 1) / 3 + 1)::text
    WHEN 'semestral'  THEN to_char(p_data, 'YYYY') || '-S' ||
                            (CASE WHEN extract(month from p_data) <= 6 THEN 1 ELSE 2 END)::text
    WHEN 'anual'      THEN to_char(p_data, 'YYYY')
    ELSE to_char(p_data, 'YYYY-MM')
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_adm_data_to_periodo(text, date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. recalcula KPIs ADM de uma area para um conjunto de datas
--    Deduplica internamente (mesmo KPI + mesmo periodo nao roda 2x)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_kpis_adm_para_area_datas(
  p_area_responsavel text,
  p_datas date[]
) RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_data date;
  v_periodo text;
  v_count int := 0;
  v_done jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF p_area_responsavel IS NULL OR p_datas IS NULL OR array_length(p_datas, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, periodicidade
      FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND tipo_kpi = 'operacional'
       AND formula_config->>'fonte' = 'solicitacoes'
       AND formula_config->>'area_responsavel' = p_area_responsavel
  LOOP
    FOREACH v_data IN ARRAY p_datas LOOP
      IF v_data IS NULL THEN CONTINUE; END IF;
      v_periodo := public.kpi_adm_data_to_periodo(r.periodicidade, v_data);
      IF v_periodo IS NULL THEN CONTINUE; END IF;
      v_key := r.id || ':' || v_periodo;
      IF v_done ? v_key THEN CONTINUE; END IF;
      v_done := v_done || jsonb_build_object(v_key, true);
      PERFORM public.recalcular_kpi_adm(r.id, v_periodo);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_kpis_adm_para_area_datas(text, date[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.recalcular_kpis_adm_para_area_datas IS
  'Recalcula todos os KPIs ADM ativos da area para os periodos cobrindo as datas. Dedup interno.';

-- ----------------------------------------------------------------------------
-- 3. Trigger function · roda em INSERT/UPDATE/DELETE de solicitacoes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_solicitacoes_recalc_kpis()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_datas date[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_datas := ARRAY[
      OLD.created_at::date,
      OLD.respondido_em::date,
      OLD.concluido_em::date
    ];
    IF OLD.area_responsavel IS NOT NULL THEN
      PERFORM public.recalcular_kpis_adm_para_area_datas(OLD.area_responsavel::text, v_datas);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_datas := ARRAY[
      NEW.created_at::date,
      NEW.respondido_em::date,
      NEW.concluido_em::date,
      OLD.created_at::date,
      OLD.respondido_em::date,
      OLD.concluido_em::date
    ];
    IF NEW.area_responsavel IS NOT NULL THEN
      PERFORM public.recalcular_kpis_adm_para_area_datas(NEW.area_responsavel::text, v_datas);
    END IF;
    -- Se mudou de area, recalcula a antiga tambem
    IF OLD.area_responsavel IS NOT NULL
       AND OLD.area_responsavel IS DISTINCT FROM NEW.area_responsavel THEN
      PERFORM public.recalcular_kpis_adm_para_area_datas(OLD.area_responsavel::text, v_datas);
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  v_datas := ARRAY[
    NEW.created_at::date,
    NEW.respondido_em::date,
    NEW.concluido_em::date
  ];
  IF NEW.area_responsavel IS NOT NULL THEN
    PERFORM public.recalcular_kpis_adm_para_area_datas(NEW.area_responsavel::text, v_datas);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_solicitacoes_recalc_kpis ON public.solicitacoes;
CREATE TRIGGER tg_solicitacoes_recalc_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_recalc_kpis();

COMMENT ON FUNCTION public.tg_solicitacoes_recalc_kpis IS
  'Recalcula KPIs ADM em tempo real quando solicitacao muda. Cobre INSERT, UPDATE (inclui troca de area), DELETE.';

-- ----------------------------------------------------------------------------
-- 4. Backfill · recalcula todos os periodos historicos existentes
--    Pra cada area_responsavel + datas distintas em solicitacoes
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_total int := 0;
BEGIN
  FOR r IN
    SELECT area_responsavel::text AS area,
           array_agg(DISTINCT d::date) AS datas
      FROM public.solicitacoes,
           unnest(ARRAY[created_at, respondido_em, concluido_em]) AS d
     WHERE area_responsavel IS NOT NULL
       AND d IS NOT NULL
     GROUP BY area_responsavel
  LOOP
    v_total := v_total + COALESCE(
      public.recalcular_kpis_adm_para_area_datas(r.area, r.datas), 0);
  END LOOP;
  RAISE NOTICE 'KPIs ADM recalculados no backfill: %', v_total;
END $$;
