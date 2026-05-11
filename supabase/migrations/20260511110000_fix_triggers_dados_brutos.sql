-- ============================================================================
-- FIX · triggers de dados_brutos
--
-- A migration 20260511100000 falhou ao criar triggers statement-level porque
-- INSERT nao aceita REFERENCING OLD TABLE (so DELETE/UPDATE) e DELETE nao
-- aceita REFERENCING NEW TABLE (so INSERT/UPDATE).
--
-- Esta migration recria com 3 funcoes especificas, cada uma usando so as
-- transition tables compativeis com seu evento.
-- ============================================================================

-- Limpa qualquer estado parcial da migration anterior
DROP TRIGGER IF EXISTS tg_dados_brutos_recalc_ins ON public.dados_brutos;
DROP TRIGGER IF EXISTS tg_dados_brutos_recalc_upd ON public.dados_brutos;
DROP TRIGGER IF EXISTS tg_dados_brutos_recalc_del ON public.dados_brutos;
DROP FUNCTION IF EXISTS public.tg_dados_brutos_recalcular_kpis_statement();
DROP FUNCTION IF EXISTS public.tg_dados_brutos_recalcular_kpis_del();

-- ----------------------------------------------------------------------------
-- INSERT · so NEW TABLE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_dados_brutos_recalc_ins_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_combo RECORD;
BEGIN
  FOR v_combo IN
    SELECT DISTINCT tipo_id, area, data
      FROM inserted_rows
     WHERE tipo_id IS NOT NULL AND area IS NOT NULL AND data IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado(v_combo.tipo_id, v_combo.area, v_combo.data);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER tg_dados_brutos_recalc_ins
  AFTER INSERT ON public.dados_brutos
  REFERENCING NEW TABLE AS inserted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalc_ins_fn();

-- ----------------------------------------------------------------------------
-- UPDATE · NEW TABLE + OLD TABLE (combos das duas, distinct)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_dados_brutos_recalc_upd_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_combo RECORD;
BEGIN
  FOR v_combo IN
    SELECT DISTINCT tipo_id, area, data FROM (
      SELECT tipo_id, area, data FROM inserted_rows
      UNION
      SELECT tipo_id, area, data FROM deleted_rows
    ) sub
    WHERE tipo_id IS NOT NULL AND area IS NOT NULL AND data IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado(v_combo.tipo_id, v_combo.area, v_combo.data);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER tg_dados_brutos_recalc_upd
  AFTER UPDATE ON public.dados_brutos
  REFERENCING NEW TABLE AS inserted_rows OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalc_upd_fn();

-- ----------------------------------------------------------------------------
-- DELETE · so OLD TABLE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_dados_brutos_recalc_del_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_combo RECORD;
BEGIN
  FOR v_combo IN
    SELECT DISTINCT tipo_id, area, data
      FROM deleted_rows
     WHERE tipo_id IS NOT NULL AND area IS NOT NULL AND data IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado(v_combo.tipo_id, v_combo.area, v_combo.data);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER tg_dados_brutos_recalc_del
  AFTER DELETE ON public.dados_brutos
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalc_del_fn();

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio)
-- ----------------------------------------------------------------------------
-- SELECT tgname, tgtype FROM pg_trigger
--  WHERE tgrelid = 'public.dados_brutos'::regclass AND NOT tgisinternal;
-- Espera: 4 linhas (tg_dados_brutos_set_updated_at + os 3 recalc)
