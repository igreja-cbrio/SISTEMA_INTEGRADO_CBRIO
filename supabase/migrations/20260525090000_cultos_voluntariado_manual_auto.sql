-- Campos pra preenchimento manual de voluntariado em cultos
-- COALESCE manual > auto (calculado de vol_schedules/vol_check_ins)
ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS voluntarios_escalados INT,
  ADD COLUMN IF NOT EXISTS voluntarios_checkin INT;

COMMENT ON COLUMN public.cultos.voluntarios_escalados IS
  'Sobrescreve a contagem automatica. NULL = usa funcao culto_voluntarios_auto()';
COMMENT ON COLUMN public.cultos.voluntarios_checkin IS
  'Sobrescreve a contagem automatica. NULL = usa funcao culto_voluntarios_auto()';

-- Funcao auto · conta de vol_schedules/vol_check_ins via match
-- (service_type_id, scheduled_at::date) entre cultos e vol_services
CREATE OR REPLACE FUNCTION public.culto_voluntarios_auto(p_culto_id UUID)
RETURNS TABLE (escalados INT, checkin INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service_type_id UUID;
  v_data DATE;
BEGIN
  SELECT service_type_id, data INTO v_service_type_id, v_data
  FROM cultos WHERE id = p_culto_id;

  IF v_service_type_id IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH services_match AS (
    SELECT id FROM vol_services
    WHERE service_type_id = v_service_type_id
      AND scheduled_at::date = v_data
  )
  SELECT
    (SELECT count(DISTINCT volunteer_id)::INT FROM vol_schedules
       WHERE service_id IN (SELECT id FROM services_match)),
    (SELECT count(DISTINCT volunteer_id)::INT FROM vol_check_ins
       WHERE service_id IN (SELECT id FROM services_match));
END;
$$;

-- View consolidada · efetivo (manual OU auto)
CREATE OR REPLACE VIEW public.vw_culto_voluntarios AS
SELECT
  c.id AS culto_id,
  c.voluntarios_escalados AS escalados_manual,
  c.voluntarios_checkin AS checkin_manual,
  (SELECT escalados FROM culto_voluntarios_auto(c.id)) AS escalados_auto,
  (SELECT checkin FROM culto_voluntarios_auto(c.id)) AS checkin_auto,
  COALESCE(c.voluntarios_escalados, (SELECT escalados FROM culto_voluntarios_auto(c.id))) AS escalados,
  COALESCE(c.voluntarios_checkin, (SELECT checkin FROM culto_voluntarios_auto(c.id))) AS checkin
FROM cultos c;
