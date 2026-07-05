-- Card "Pessoas únicas" · marca quem veio SEM ESCALA (pedido 2026-07-05).
-- sem_escala = true quando TODOS os check-ins da pessoa na semana foram sem
-- vínculo de escala (bool_and) — quem tem ao menos um check-in escalado conta
-- como escalado. Já aplicada em prod via MCP; este arquivo versiona no repo.
DROP FUNCTION IF EXISTS public.fn_dashboard_voluntariado_pessoas(int, int);
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(nome text, checkins int, blocos text, sem_escala boolean)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text,
               lower(btrim(sc.volunteer_name)), lower(btrim(c.volunteer_name)),
               c.id::text) AS pessoa,
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), ''), '(sem nome)') AS nome,
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
  GROUP BY pessoa
  ORDER BY min(nome);
$$;
