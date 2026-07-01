-- Dashboard Semanal · Voluntariado (pedido do gestor 2026-07-01):
--  1) As BARRAS por bloco passam a mostrar o NÚMERO DE CHECK-INS (eventos),
--     não pessoas distintas → vw_dashboard_voluntariado.voluntariado = count(*).
--  2) Cards dedicados: PESSOAS ÚNICAS da semana (dedup · o total por bloco
--     superconta quem serve em >1 bloco) + TOTAL DE CHECK-INS → RPC abaixo.
-- Ambos já aplicados em prod via MCP; este arquivo versiona no repo.

CREATE OR REPLACE VIEW public.vw_dashboard_voluntariado AS
WITH blocos(service_type_id, service_type_name, service_type_color, recurrence_day, recurrence_time) AS (
  VALUES
    ('b10c0000-0000-0000-0000-000000000001'::uuid,'Domingo Manhã'::text,'#0ea5e9'::text,0,'08:30:00'::time without time zone),
    ('b10c0000-0000-0000-0000-000000000002'::uuid,'Domingo Noite'::text,'#6366f1'::text,0,'19:00:00'::time without time zone),
    ('b10c0000-0000-0000-0000-000000000003'::uuid,'Quarta'::text,'#f59e0b'::text,3,'20:00:00'::time without time zone),
    ('b10c0000-0000-0000-0000-000000000004'::uuid,'AMI'::text,'#10b981'::text,6,'20:00:00'::time without time zone),
    ('b10c0000-0000-0000-0000-000000000005'::uuid,'Bridge'::text,'#ec4899'::text,6,'17:00:00'::time without time zone)
), checkins AS (
  SELECT
    (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date AS data,
    CASE
      WHEN s.service_type_name ~~* 'Domingo - Manh%'::text OR s.service_type_name ~~* 'CBKIDS - Manh%'::text THEN 'b10c0000-0000-0000-0000-000000000001'::uuid
      WHEN s.service_type_name ~~* 'Domingo - Noite%'::text OR s.service_type_name ~~* 'CBKIDS - Noite%'::text THEN 'b10c0000-0000-0000-0000-000000000002'::uuid
      WHEN s.service_type_name ~~* 'Quarta%'::text OR s.service_type_name ~~* 'CBKIDS - Quarta%'::text THEN 'b10c0000-0000-0000-0000-000000000003'::uuid
      WHEN s.service_type_name ~~* 'AMI%'::text OR s.service_type_name ~~* 'Culto AMI%'::text THEN 'b10c0000-0000-0000-0000-000000000004'::uuid
      WHEN s.service_type_name ~~* 'Bridge%'::text THEN 'b10c0000-0000-0000-0000-000000000005'::uuid
      ELSE NULL::uuid
    END AS bloco_id
  FROM vol_check_ins ci
  JOIN vol_services s ON s.id = ci.service_id
)
SELECT
  EXTRACT(isoyear FROM ci.data)::integer AS ano_iso,
  EXTRACT(week FROM ci.data)::integer AS semana_iso,
  EXTRACT(year FROM ci.data)::integer AS ano_calendario,
  EXTRACT(month FROM ci.data)::integer AS mes,
  b.service_type_id, b.service_type_name, b.service_type_color, b.recurrence_day, b.recurrence_time,
  count(DISTINCT ci.data)::integer AS total_cultos,
  0 AS frequencia, 0 AS frequencia_kids, 0 AS aceitacoes, 0 AS aceitacoes_online,
  0 AS ao_vivo, 0 AS online_ds, 0 AS online_ddus,
  count(*)::integer AS voluntariado,
  0 AS total_presencial, 0 AS aceitacoes_kids
FROM checkins ci
JOIN blocos b ON b.service_type_id = ci.bloco_id
WHERE ci.bloco_id IS NOT NULL
GROUP BY (EXTRACT(isoyear FROM ci.data)::integer), (EXTRACT(week FROM ci.data)::integer),
         (EXTRACT(year FROM ci.data)::integer), (EXTRACT(month FROM ci.data)::integer),
         b.service_type_id, b.service_type_name, b.service_type_color, b.recurrence_day, b.recurrence_time;

-- Pessoas únicas (dedup na semana · identidade resolvida no espaço do pc_id) +
-- total de eventos de check-in. Mesma régua de blocos da view.
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_resumo(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(pessoas_unicas int, checkins_total int)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text, lower(btrim(sc.volunteer_name))) AS pessoa
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
  SELECT count(DISTINCT pessoa)::int AS pessoas_unicas, count(*)::int AS checkins_total FROM ci;
$$;
