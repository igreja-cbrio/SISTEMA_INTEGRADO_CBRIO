-- Dashboard Semanal · Voluntariado: card "Pessoas únicas" clicável (2026-07-04).
-- Lista as pessoas por trás do número — mesma régua de blocos/identidade da
-- fn_dashboard_voluntariado_resumo (identidade resolvida no espaço do pc_id).
-- Retorna nome, nº de check-ins na semana e os blocos em que serviu.

CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(nome text, checkins int, blocos text)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text, lower(btrim(sc.volunteer_name))) AS pessoa,
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''), '(sem nome)') AS nome,
      CASE
        WHEN s.service_type_name ~~* 'Domingo - Manh%' OR s.service_type_name ~~* 'CBKIDS - Manh%'  THEN 'Domingo Manhã'
        WHEN s.service_type_name ~~* 'Domingo - Noite%' OR s.service_type_name ~~* 'CBKIDS - Noite%' THEN 'Domingo Noite'
        WHEN s.service_type_name ~~* 'Quarta%' OR s.service_type_name ~~* 'CBKIDS - Quarta%'         THEN 'Quarta'
        WHEN s.service_type_name ~~* 'AMI%' OR s.service_type_name ~~* 'Culto AMI%'                  THEN 'AMI'
        WHEN s.service_type_name ~~* 'Bridge%'                                                       THEN 'Bridge'
      END AS bloco
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND (s.service_type_name ~~* 'Domingo - Manh%' OR s.service_type_name ~~* 'CBKIDS - Manh%'
        OR s.service_type_name ~~* 'Domingo - Noite%' OR s.service_type_name ~~* 'CBKIDS - Noite%'
        OR s.service_type_name ~~* 'Quarta%' OR s.service_type_name ~~* 'CBKIDS - Quarta%'
        OR s.service_type_name ~~* 'AMI%' OR s.service_type_name ~~* 'Culto AMI%'
        OR s.service_type_name ~~* 'Bridge%')
  )
  SELECT
    min(nome) AS nome,
    count(*)::int AS checkins,
    string_agg(DISTINCT bloco, ' · ' ORDER BY bloco) AS blocos
  FROM ci
  GROUP BY pessoa
  ORDER BY min(nome);
$$;
