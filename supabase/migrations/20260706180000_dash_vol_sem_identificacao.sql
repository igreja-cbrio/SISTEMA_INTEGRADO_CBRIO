-- Dashboard Voluntariado · separa check-ins SEM IDENTIFICAÇÃO das pessoas
-- únicas (06/07): anônimos (bug do nome descartado · 171 do domingo) inflavam
-- "pessoas únicas" com linhas "(sem nome)". Agora: pessoas_unicas = pessoas
-- IDENTIFICADAS distintas; sem_identificacao = eventos anônimos (contagem à
-- parte). A lista de pessoas só traz identificadas. JÁ APLICADA em prod.
DROP FUNCTION IF EXISTS public.fn_dashboard_voluntariado_resumo(int, int);
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_resumo(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(pessoas_unicas int, checkins_total int, sem_identificacao int)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text,
               lower(btrim(sc.volunteer_name)), lower(btrim(c.volunteer_name))) AS pessoa
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  )
  SELECT
    count(DISTINCT pessoa)::int AS pessoas_unicas,
    count(*)::int AS checkins_total,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci;
$$;

DROP FUNCTION IF EXISTS public.fn_dashboard_voluntariado_pessoas(int, int);
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(nome text, checkins int, blocos text, sem_escala boolean)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text,
               lower(btrim(sc.volunteer_name)), lower(btrim(c.volunteer_name))) AS pessoa,
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')) AS nome,
      (c.schedule_id IS NULL) AS ci_sem_escala,
      CASE
        WHEN s.service_type_name ~~* 'Domingo - Manh%' OR s.service_type_name ~~* 'CBKIDS - Manh%'
          OR s.service_type_name ~~* 'Domingo 08%' OR s.service_type_name ~~* 'Domingo 10%' OR s.service_type_name ~~* 'Domingo 11%'
          THEN 'Domingo Manhã'
        WHEN s.service_type_name ~~* 'Domingo - Noite%' OR s.service_type_name ~~* 'CBKIDS - Noite%'
          OR s.service_type_name ~~* 'Domingo 18%' OR s.service_type_name ~~* 'Domingo 19%' OR s.service_type_name ~~* 'Domingo 20%'
          THEN 'Domingo Noite'
        WHEN s.service_type_name ~~* 'Quarta%' OR s.service_type_name ~~* 'CBKIDS - Quarta%' THEN 'Quarta'
        WHEN s.service_type_name ~~* 'AMI%' OR s.service_type_name ~~* 'Culto AMI%'          THEN 'AMI'
        WHEN s.service_type_name ~~* '%Bridge%'                                              THEN 'Bridge'
      END AS bloco
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  )
  SELECT
    min(nome) AS nome,
    count(*)::int AS checkins,
    string_agg(DISTINCT bloco, ' · ' ORDER BY bloco) AS blocos,
    bool_and(ci_sem_escala) AS sem_escala
  FROM ci
  WHERE pessoa IS NOT NULL
  GROUP BY pessoa
  ORDER BY min(nome);
$$;
