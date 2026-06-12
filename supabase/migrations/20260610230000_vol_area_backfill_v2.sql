-- ============================================================================
-- FIX · backfill v2 da área dos voluntários (match pela chave certa do PC)
--
-- O backfill da 20260610220000 classificou só 1 de 273: ele ligava escala →
-- perfil por vol_schedules.volunteer_id, que está NULL em 100% das 1.795
-- escalas (o sync do Planning Center não resolve esse FK). O vínculo real é
-- vol_schedules.planning_center_person_id ↔ vol_profiles.planning_center_id —
-- e 266 dos 273 perfis têm esse id + membresia_id.
--
-- Este fix:
--   1. Repara vol_schedules.volunteer_id onde dá (match exato por PC id) —
--      melhora o módulo de voluntariado em geral.
--   2. Backfill v2 de mem_voluntarios.area pela MODA das escalas, agora via
--      planning_center_person_id. Mapeamento pelos nomes reais dos serviços:
--        team com "kid"            → kids   (ex.: "- Apoio Kids")
--        serviço CBKIDS/kids       → kids
--        serviço Bridge            → bridge
--        serviço AMI               → ami
--        Domingo* / Quarta Com Deus→ sede
--   3. Recalcula o período fechado dos KPIs (voluntários por área).
--
-- Idempotente · só preenche NULLs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Repara o FK volunteer_id das escalas (match por Planning Center id)
-- ----------------------------------------------------------------------------
UPDATE public.vol_schedules s
   SET volunteer_id = vp.id
  FROM public.vol_profiles vp
 WHERE s.volunteer_id IS NULL
   AND vp.planning_center_id IS NOT NULL
   AND vp.planning_center_id = s.planning_center_person_id;

-- ----------------------------------------------------------------------------
-- 2. Backfill v2 · área = moda das escalas via planning_center_person_id
-- ----------------------------------------------------------------------------
UPDATE public.mem_voluntarios mv
   SET area = sub.area
  FROM (
    SELECT DISTINCT ON (vp.membresia_id) vp.membresia_id AS membro_id, t.area
      FROM (
        SELECT s.planning_center_person_id AS pc_id,
               CASE
                 WHEN lower(coalesce(s.team_name, '')) LIKE '%kid%' THEN 'kids'
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%kid%' THEN 'kids'
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%bridge%' THEN 'bridge'
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%ami%' THEN 'ami'
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%domingo%'
                   OR lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%quarta%' THEN 'sede'
                 ELSE NULL
               END AS area,
               count(*) AS qtd
          FROM public.vol_schedules s
          JOIN public.vol_services sv ON sv.id = s.service_id
         WHERE s.planning_center_person_id IS NOT NULL
         GROUP BY 1, 2
      ) t
      JOIN public.vol_profiles vp
        ON vp.planning_center_id = t.pc_id
       AND vp.membresia_id IS NOT NULL
     WHERE t.area IS NOT NULL
     ORDER BY vp.membresia_id, t.qtd DESC
  ) sub
 WHERE mv.membro_id = sub.membro_id
   AND mv.area IS NULL
   AND mv.deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Recalcula o período fechado (KPIs de voluntários por área)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  v := public.kpi_recalcular_todos();
  RAISE NOTICE 'kpi_recalcular_todos: %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT area, count(*) FROM mem_voluntarios
--    WHERE ate IS NULL AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;
--   -- esperado: maioria dos 273 distribuída em sede/ami/bridge/kids · NULL
--   -- só pra quem nunca foi escalado nem se inscreveu com área
-- ----------------------------------------------------------------------------
