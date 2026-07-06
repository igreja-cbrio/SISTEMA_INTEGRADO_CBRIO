-- Pessoas únicas do Voluntariado · v3 + composição por culto (06/07):
-- 1) Identidade unificada pelo NOME normalizado — a mesma pessoa aparecia 2x
--    quando um check-in tinha vínculo com o cadastro e o outro só o nome
--    digitado (caso Eduarda Freire).
-- 2) Dialog mostra os CULTOS REAIS (service_type_name) + equipes/horários da
--    escala (o gráfico consolida por turno; o detalhe mostra onde serviu).
-- 3) fn_dashboard_voluntariado_composicao: clique na barra do bloco abre a
--    composição por culto real (quantas pessoas em cada culto do turno).
DROP FUNCTION IF EXISTS public.fn_dashboard_voluntariado_pessoas(int, int);
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(nome text, checkins int, blocos text, equipes text, sem_escala boolean)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')) AS nome,
      (c.schedule_id IS NULL) AS ci_sem_escala,
      s.service_type_name AS culto,
      sc.team_name AS equipe
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
    string_agg(DISTINCT culto, ' · ' ORDER BY culto) AS blocos,
    string_agg(DISTINCT equipe, ' · ' ORDER BY equipe) AS equipes,
    bool_and(ci_sem_escala) AS sem_escala
  FROM ci
  WHERE nome IS NOT NULL
  GROUP BY lower(btrim(nome))
  ORDER BY min(nome);
$$;

DROP FUNCTION IF EXISTS public.fn_dashboard_voluntariado_resumo(int, int);
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_resumo(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(pessoas_unicas int, checkins_total int, sem_identificacao int)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa
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

-- Composição do bloco: pessoas distintas por CULTO REAL dentro de cada turno
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_composicao(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(bloco text, culto text, pessoas int, sem_identificacao int)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      s.service_type_name AS culto,
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa,
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
    bloco,
    culto,
    count(DISTINCT pessoa)::int AS pessoas,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci
  WHERE bloco IS NOT NULL
  GROUP BY bloco, culto
  ORDER BY bloco, culto;
$$;
