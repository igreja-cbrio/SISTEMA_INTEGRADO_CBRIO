-- ============================================================================
-- Dedup de vol_services · cultos duplicados na tela de Voluntariado
--
-- Sintoma (Marcos · 2026-05-26): "Proximos Cultos" e os dropdowns de Montar
-- Escala / Escalas mostram o mesmo culto varias vezes com horarios divergentes:
--   - Quarta com Deus 27/05 17:00  +  Quarta Com Deus 27/05 20:00  +  Quarta com Deus 27/05 20:00
--   - Culto BRIDGE 30/05 14:00  +  Bridge 30/05 17:00
--   - Culto AMI 30/05 20:03  +  AMI 30/05 20:00
--
-- Causa: o sync do Planning Center cria uma linha PCO-only (service_type_id
-- NULL) quando nao casa com o culto interno gerado por
-- gerar_cultos_recorrentes (nome divergente: "Quarta Com Deus" vs
-- "Quarta com Deus", "Culto BRIDGE" vs "Bridge"). Resultado: 2-3 linhas em
-- vol_services pro mesmo culto logico.
--
-- Esta migration agrupa por (data, nome normalizado) e mantem 1 linha
-- canonica por grupo, migrando vol_schedules / vol_check_ins pra ela antes de
-- apagar as duplicatas.
--
-- Normalizacao do nome: lowercase + unaccent + remove prefixo "culto " +
-- trim. Mantem cultos distintos separados (ex: "quarta com deus" !=
-- "cbkids - quarta-feira"; "domingo - manha" != "cbkids - manha domingo").
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

BEGIN;

-- 1. Monta o mapa dupe -> keeper numa temp table
CREATE TEMP TABLE _vol_dedup ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    s.id,
    s.service_type_id,
    s.scheduled_at,
    s.created_at,
    s.scheduled_at::date AS svc_date,
    trim(regexp_replace(
      lower(unaccent(coalesce(nullif(s.service_type_name, ''), s.name, ''))),
      '^culto\s+', '', 'i'
    )) AS norm_name,
    (SELECT count(*) FROM public.vol_schedules sc WHERE sc.service_id = s.id) AS sched_count,
    t.recurrence_time
  FROM public.vol_services s
  LEFT JOIN public.vol_service_types t ON t.id = s.service_type_id
),
ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY svc_date, norm_name
      ORDER BY
        (service_type_id IS NOT NULL) DESC,                                  -- canonico (linkado ao tipo)
        (recurrence_time IS NOT NULL AND scheduled_at::time = recurrence_time) DESC, -- horario bate com o recorrente
        sched_count DESC,                                                    -- mais voluntarios escalados
        (EXTRACT(minute FROM scheduled_at) = 0) DESC,                        -- horario "redondo" (mata 20:03)
        created_at ASC                                                       -- mais antigo
    ) AS rn,
    count(*) OVER (PARTITION BY svc_date, norm_name) AS grp_size
  FROM normalized
),
keepers AS (
  SELECT svc_date, norm_name, id AS keeper_id
  FROM ranked WHERE rn = 1 AND grp_size > 1
)
SELECT r.id AS dupe_id, k.keeper_id
FROM ranked r
JOIN keepers k ON k.svc_date = r.svc_date AND k.norm_name = r.norm_name
WHERE r.rn > 1;

-- 2. Migra vol_schedules pro keeper, pulando os que dariam conflito de
--    UNIQUE (service_id, planning_center_person_id) — esses ja existem no
--    keeper e serao removidos via CASCADE no DELETE.
UPDATE public.vol_schedules sc
   SET service_id = d.keeper_id
  FROM _vol_dedup d
 WHERE sc.service_id = d.dupe_id
   AND NOT EXISTS (
     SELECT 1 FROM public.vol_schedules k
      WHERE k.service_id = d.keeper_id
        AND k.planning_center_person_id = sc.planning_center_person_id
   );

-- 3. Migra vol_check_ins pro keeper (FK ON DELETE SET NULL · nao queremos
--    perder o checkin). Pula os que conflitariam no unique de unscheduled.
UPDATE public.vol_check_ins ci
   SET service_id = d.keeper_id
  FROM _vol_dedup d
 WHERE ci.service_id = d.dupe_id
   AND NOT EXISTS (
     SELECT 1 FROM public.vol_check_ins k
      WHERE k.service_id = d.keeper_id
        AND k.volunteer_id IS NOT DISTINCT FROM ci.volunteer_id
        AND k.is_unscheduled = ci.is_unscheduled
   );

-- 4. Apaga as duplicatas. vol_schedules remanescentes (conflitantes) somem via
--    CASCADE; vol_check_ins remanescentes ficam com service_id NULL (SET NULL).
DELETE FROM public.vol_services
 WHERE id IN (SELECT dupe_id FROM _vol_dedup);

COMMIT;

-- ----------------------------------------------------------------------------
-- Conferencia (rode no Studio depois):
--   SELECT scheduled_at::date, count(*),
--          string_agg(name || ' ' || to_char(scheduled_at,'HH24:MI'), ' | ')
--     FROM vol_services
--    WHERE scheduled_at >= CURRENT_DATE
--    GROUP BY scheduled_at::date
--    ORDER BY 1;
--   · Espera 1 linha por culto logico por data (sem repeticao de nome).
-- ============================================================================
