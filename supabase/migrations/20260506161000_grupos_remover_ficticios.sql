-- Remove grupos ficticios/de teste que existiam antes do seed real (T1-2026).
-- Considera ficticio qualquer grupo sem temporada atribuida.
--
-- IMPORTANTE: ON DELETE CASCADE em mem_grupo_membros, mem_grupo_encontros e
-- mem_grupo_encontro_presencas garante limpeza dos dados associados.
-- Se algum dos grupos sem temporada for legitimo, atribua a temporada
-- correta antes de aplicar esta migration.

DO $$
DECLARE
  v_grupos int;
  v_membros int;
  v_encontros int;
BEGIN
  SELECT COUNT(*) INTO v_grupos FROM public.mem_grupos WHERE temporada IS NULL;

  SELECT COUNT(*) INTO v_membros FROM public.mem_grupo_membros gm
    JOIN public.mem_grupos g ON g.id = gm.grupo_id
   WHERE g.temporada IS NULL;

  SELECT COUNT(*) INTO v_encontros FROM public.mem_grupo_encontros e
    JOIN public.mem_grupos g ON g.id = e.grupo_id
   WHERE g.temporada IS NULL;

  RAISE NOTICE 'Removendo % grupos ficticios (% membros e % encontros vinculados serao apagados via CASCADE)',
    v_grupos, v_membros, v_encontros;
END $$;

DELETE FROM public.mem_grupos WHERE temporada IS NULL;
