-- Dashboard Voluntariado · pessoas únicas agora trazem os cultos SEPARADOS
-- (pedido do Matheus 06/07): quando a pessoa serve em mais de um culto, os
-- cultos + equipes ficavam grudados em duas strings independentes (não dava pra
-- saber qual equipe era de qual culto). Adiciona `cultos jsonb` = lista de
-- pares {culto, equipe} distintos por pessoa. blocos/equipes seguem pra busca.
DROP FUNCTION IF EXISTS public.fn_dashboard_voluntariado_pessoas(int, int);
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(nome text, checkins int, blocos text, equipes text, cultos jsonb, sem_escala boolean)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')) AS nome,
      (c.schedule_id IS NULL) AS ci_sem_escala,
      s.service_type_name AS culto,
      NULLIF(btrim(sc.team_name), '') AS equipe
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  ),
  base AS (
    SELECT * FROM ci WHERE nome IS NOT NULL
  ),
  pares AS (
    SELECT DISTINCT lower(btrim(nome)) AS pk, culto, equipe FROM base
  ),
  paresagg AS (
    SELECT pk,
           jsonb_agg(jsonb_build_object('culto', culto, 'equipe', equipe)
                     ORDER BY culto, equipe NULLS LAST) AS cultos
    FROM pares GROUP BY pk
  )
  SELECT
    min(b.nome) AS nome,
    count(*)::int AS checkins,
    string_agg(DISTINCT b.culto, ' · ' ORDER BY b.culto) AS blocos,
    string_agg(DISTINCT b.equipe, ' · ' ORDER BY b.equipe) AS equipes,
    pa.cultos,
    bool_and(b.ci_sem_escala) AS sem_escala
  FROM base b
  JOIN paresagg pa ON pa.pk = lower(btrim(b.nome))
  GROUP BY lower(btrim(b.nome)), pa.cultos
  ORDER BY min(b.nome);
$$;
