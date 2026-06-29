-- Voluntariado do Dashboard Semanal a partir dos CHECK-INS (vol_check_ins),
-- e não mais da coluna manual cultos.voluntarios (que parou de ser preenchida
-- em mai/2026 · por isso a semana atual aparecia 0).
--
-- O Planning Center consolida os check-ins por BLOCO: "Domingo - Manhã" é um
-- serviço único (não separa 08:30/10:00/11:30), "Domingo - Noite", "Quarta",
-- e os CBKIDS-* à parte. A maioria dos serviços de check-in tem
-- service_type_id NULL, então NÃO casa com os cultos por horário do dashboard.
-- Decisão do Matheus (2026-06-29): contar voluntariado POR BLOCO, somando o
-- CBKIDS junto ao bloco do horário (Manhã/Noite/Quarta).
--
-- Esta view tem a MESMA forma da vw_dashboard_semanal (as colunas que os
-- endpoints de /dashboard-semanal leem) pra ser drop-in: o backend só troca a
-- fonte (vw_dashboard_semanal -> vw_dashboard_voluntariado) quando o indicador
-- selecionado é 'voluntariado'. Os blocos usam UUIDs sintéticos como
-- service_type_id (não existem em vol_service_types · só pra chavear o gráfico).

CREATE OR REPLACE VIEW public.vw_dashboard_voluntariado AS
WITH blocos(service_type_id, service_type_name, service_type_color, recurrence_day, recurrence_time) AS (
  VALUES
    ('b10c0000-0000-0000-0000-000000000001'::uuid, 'Domingo Manhã', '#0ea5e9', 0, '08:30'::time),
    ('b10c0000-0000-0000-0000-000000000002'::uuid, 'Domingo Noite', '#6366f1', 0, '19:00'::time),
    ('b10c0000-0000-0000-0000-000000000003'::uuid, 'Quarta',        '#f59e0b', 3, '20:00'::time),
    ('b10c0000-0000-0000-0000-000000000004'::uuid, 'AMI',           '#10b981', 6, '20:00'::time),
    ('b10c0000-0000-0000-0000-000000000005'::uuid, 'Bridge',        '#ec4899', 6, '17:00'::time)
),
checkins AS (
  SELECT
    ci.volunteer_id,
    (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date AS data,
    CASE
      WHEN s.service_type_name ILIKE 'Domingo - Manh%'  OR s.service_type_name ILIKE 'CBKIDS - Manh%'   THEN 'b10c0000-0000-0000-0000-000000000001'::uuid
      WHEN s.service_type_name ILIKE 'Domingo - Noite%' OR s.service_type_name ILIKE 'CBKIDS - Noite%'  THEN 'b10c0000-0000-0000-0000-000000000002'::uuid
      WHEN s.service_type_name ILIKE 'Quarta%'          OR s.service_type_name ILIKE 'CBKIDS - Quarta%' THEN 'b10c0000-0000-0000-0000-000000000003'::uuid
      WHEN s.service_type_name ILIKE 'AMI%'    THEN 'b10c0000-0000-0000-0000-000000000004'::uuid
      WHEN s.service_type_name ILIKE 'Bridge%' THEN 'b10c0000-0000-0000-0000-000000000005'::uuid
      ELSE NULL
    END AS bloco_id
  FROM public.vol_check_ins ci
  JOIN public.vol_services s ON s.id = ci.service_id
)
SELECT
  EXTRACT(isoyear FROM ci.data)::integer AS ano_iso,
  EXTRACT(week    FROM ci.data)::integer AS semana_iso,
  EXTRACT(year    FROM ci.data)::integer AS ano_calendario,
  EXTRACT(month   FROM ci.data)::integer AS mes,
  b.service_type_id,
  b.service_type_name,
  b.service_type_color,
  b.recurrence_day,
  b.recurrence_time,
  count(DISTINCT ci.data)::integer       AS total_cultos,
  0 AS frequencia,
  0 AS frequencia_kids,
  0 AS aceitacoes,
  0 AS aceitacoes_online,
  0 AS ao_vivo,
  0 AS online_ds,
  0 AS online_ddus,
  count(DISTINCT ci.volunteer_id)::integer AS voluntariado,
  0 AS total_presencial,
  0 AS aceitacoes_kids
FROM checkins ci
JOIN blocos b ON b.service_type_id = ci.bloco_id
WHERE ci.bloco_id IS NOT NULL
GROUP BY 1, 2, 3, 4, b.service_type_id, b.service_type_name, b.service_type_color, b.recurrence_day, b.recurrence_time;

COMMENT ON VIEW public.vw_dashboard_voluntariado IS
  'Voluntariado por bloco a partir de vol_check_ins (Planning Center consolida por bloco; Kids somado ao bloco do horario). Drop-in da vw_dashboard_semanal pro indicador voluntariado. 2026-06-29.';
