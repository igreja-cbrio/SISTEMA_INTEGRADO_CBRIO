-- Vínculo automático escala → perfil do voluntário (2026-07-06)
-- As escalas do PCO chegam com planning_center_person_id mas SEM volunteer_id
-- → a ficha do voluntário na tela de Escalas dizia "sem perfil vinculado" mesmo
-- pra quem tem cadastro/membro. Agora o vínculo é automático pelo
-- planning_center_id (perfil já existe no roster). 1.698/1.723 escalas órfãs
-- casam com um perfil.

-- 1) Escala nasce/atualiza já vinculada: resolve volunteer_id pelo PCO id.
CREATE OR REPLACE FUNCTION public.fn_vol_schedule_link_profile()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.volunteer_id IS NULL AND NEW.planning_center_person_id IS NOT NULL THEN
    SELECT vp.id INTO NEW.volunteer_id
      FROM public.vol_profiles vp
     WHERE vp.planning_center_id = NEW.planning_center_person_id
     ORDER BY vp.arquivado ASC, vp.id
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vol_schedule_link_profile ON public.vol_schedules;
CREATE TRIGGER trg_vol_schedule_link_profile
BEFORE INSERT OR UPDATE OF planning_center_person_id, volunteer_id ON public.vol_schedules
FOR EACH ROW EXECUTE FUNCTION public.fn_vol_schedule_link_profile();

-- 2) Quando um perfil ganha/atualiza o planning_center_id (ex.: sync do PCO
--    cria o perfil depois da escala), liga as escalas órfãs dele.
CREATE OR REPLACE FUNCTION public.fn_vol_profile_link_schedules()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.planning_center_id IS NOT NULL THEN
    UPDATE public.vol_schedules s
       SET volunteer_id = NEW.id
     WHERE s.planning_center_person_id = NEW.planning_center_id
       AND s.volunteer_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vol_profile_link_schedules ON public.vol_profiles;
CREATE TRIGGER trg_vol_profile_link_schedules
AFTER INSERT OR UPDATE OF planning_center_id ON public.vol_profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_vol_profile_link_schedules();

-- 3) Backfill dos já existentes (prefere perfil não-arquivado).
UPDATE public.vol_schedules s
   SET volunteer_id = vp.id
  FROM public.vol_profiles vp
 WHERE vp.planning_center_id = s.planning_center_person_id
   AND vp.arquivado = false
   AND s.volunteer_id IS NULL
   AND s.planning_center_person_id IS NOT NULL;
