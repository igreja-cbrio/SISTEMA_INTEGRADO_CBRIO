-- ============================================================================
-- Fix da migration 20260519240000 · profile.name dela e' "Alda Lorena Cellos
-- Andrade" (nome completo), nao "Alda Lorena" simples. UPDATEs com `=` nao
-- pegavam. Refaz com LIKE 'alda lorena%'.
-- ============================================================================
-- Idempotente · NAO toca quem ja virou "Lorena" nem "Lorena Pariz Leonardo
-- Queres" (essa pessoa nao tem "Alda" no inicio).
-- ============================================================================

UPDATE public.profiles
   SET name = 'Lorena'
 WHERE LOWER(TRIM(name)) LIKE 'alda lorena%';

UPDATE public.usuarios
   SET nome = 'Lorena'
 WHERE LOWER(TRIM(nome)) LIKE 'alda lorena%';

UPDATE public.area_responsaveis
   SET responsavel_nome = 'Lorena'
 WHERE LOWER(TRIM(responsavel_nome)) LIKE 'alda lorena%';

UPDATE public.projects
   SET leader = 'Lorena'
 WHERE LOWER(TRIM(leader)) LIKE 'alda lorena%';

UPDATE public.projects
   SET responsible = 'Lorena'
 WHERE LOWER(TRIM(responsible)) LIKE 'alda lorena%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='kanban_tasks') THEN
    UPDATE public.kanban_tasks
       SET responsible = 'Lorena'
     WHERE LOWER(TRIM(responsible)) LIKE 'alda lorena%';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='cycle_phase_tasks') THEN
    UPDATE public.cycle_phase_tasks
       SET responsavel_nome = 'Lorena'
     WHERE LOWER(TRIM(responsavel_nome)) LIKE 'alda lorena%';
  END IF;
END $$;
