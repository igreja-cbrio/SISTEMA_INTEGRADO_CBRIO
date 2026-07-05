-- ============================================================================
-- Fix duplo · check-ins de voluntários (2026-07-05)
--
-- 1) vol_check_ins.volunteer_name: o fluxo "check-in sem escala" descartava o
--    nome digitado pelo operador (registro ficava anônimo · 171 check-ins no
--    domingo 05/07 perderam o nome). Nova coluna guarda o snapshot; o backend
--    ainda tenta casar com vol_profiles pra preencher volunteer_id.
--
-- 2) Régua de cultos do Dashboard Semanal · Voluntariado desatualizada: não
--    reconhecia os cultos novos "Domingo 08:30/10:00/11:30" (começaram em
--    05/07), "Domingo 19:00" (desde 21/06) nem "Culto BRIDGE" (o padrão
--    'Bridge%' não casa com o prefixo "Culto"). View + 2 RPCs recriadas.
-- ============================================================================

ALTER TABLE public.vol_check_ins ADD COLUMN IF NOT EXISTS volunteer_name TEXT;
COMMENT ON COLUMN public.vol_check_ins.volunteer_name IS
  'Snapshot do nome no momento do check-in (digitado no fluxo sem escala). Identidade preferencial segue volunteer_id/schedule_id.';

-- ── View das barras (mesma estrutura · régua ampliada) ──────────────────────
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
      WHEN s.service_type_name ~~* 'Domingo - Manh%' OR s.service_type_name ~~* 'CBKIDS - Manh%'
        OR s.service_type_name ~~* 'Domingo 08%' OR s.service_type_name ~~* 'Domingo 10%' OR s.service_type_name ~~* 'Domingo 11%'
        THEN 'b10c0000-0000-0000-0000-000000000001'::uuid
      WHEN s.service_type_name ~~* 'Domingo - Noite%' OR s.service_type_name ~~* 'CBKIDS - Noite%'
        OR s.service_type_name ~~* 'Domingo 18%' OR s.service_type_name ~~* 'Domingo 19%' OR s.service_type_name ~~* 'Domingo 20%'
        THEN 'b10c0000-0000-0000-0000-000000000002'::uuid
      WHEN s.service_type_name ~~* 'Quarta%' OR s.service_type_name ~~* 'CBKIDS - Quarta%'
        THEN 'b10c0000-0000-0000-0000-000000000003'::uuid
      WHEN s.service_type_name ~~* 'AMI%' OR s.service_type_name ~~* 'Culto AMI%'
        THEN 'b10c0000-0000-0000-0000-000000000004'::uuid
      WHEN s.service_type_name ~~* '%Bridge%'
        THEN 'b10c0000-0000-0000-0000-000000000005'::uuid
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

-- ── Filtro compartilhado da régua (evita repetir o WHERE nas 2 RPCs) ─────────
CREATE OR REPLACE FUNCTION public.fn_dash_vol_service_no_bloco(p_nome text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_nome ~~* 'Domingo - Manh%' OR p_nome ~~* 'CBKIDS - Manh%'
      OR p_nome ~~* 'Domingo 08%' OR p_nome ~~* 'Domingo 10%' OR p_nome ~~* 'Domingo 11%'
      OR p_nome ~~* 'Domingo - Noite%' OR p_nome ~~* 'CBKIDS - Noite%'
      OR p_nome ~~* 'Domingo 18%' OR p_nome ~~* 'Domingo 19%' OR p_nome ~~* 'Domingo 20%'
      OR p_nome ~~* 'Quarta%' OR p_nome ~~* 'CBKIDS - Quarta%'
      OR p_nome ~~* 'AMI%' OR p_nome ~~* 'Culto AMI%'
      OR p_nome ~~* '%Bridge%';
$$;

-- ── Resumo (pessoas únicas + check-ins) · agora com o nome snapshot na identidade
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_resumo(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(pessoas_unicas int, checkins_total int)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text,
               lower(btrim(sc.volunteer_name)), lower(btrim(c.volunteer_name)),
               c.id::text) AS pessoa
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  )
  SELECT count(DISTINCT pessoa)::int AS pessoas_unicas, count(*)::int AS checkins_total FROM ci;
$$;

-- ── Lista de pessoas do card · nome snapshot incluído ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso int, p_semana_iso int)
RETURNS TABLE(nome text, checkins int, blocos text)
LANGUAGE sql STABLE AS $$
  WITH ci AS (
    SELECT
      COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text,
               lower(btrim(sc.volunteer_name)), lower(btrim(c.volunteer_name)),
               c.id::text) AS pessoa,
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), ''), '(sem nome)') AS nome,
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
    string_agg(DISTINCT bloco, ' · ' ORDER BY bloco) AS blocos
  FROM ci
  GROUP BY pessoa
  ORDER BY min(nome);
$$;
