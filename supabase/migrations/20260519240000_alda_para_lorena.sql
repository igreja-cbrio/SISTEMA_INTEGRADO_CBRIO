-- ============================================================================
-- Alda Lorena prefere ser chamada de "Lorena" · ajusta nome de visualizacao
-- ============================================================================
-- Mantemos o nome legal "Alda Lorena Cellos Andrade" intocado em rh_funcionarios
-- e contratos (PCS) por estar associado a documentos formais. Atualizamos
-- apenas o nome de visualizacao + referencias usadas como chave de filtro.
--
-- Idempotente · so muda quem ainda esta como "Alda Lorena".
-- ============================================================================

-- 1. profile.name · nome de visualizacao na UI
UPDATE public.profiles
   SET name = 'Lorena'
 WHERE LOWER(TRIM(name)) = 'alda lorena';

-- 2. usuarios.nome · sistema granular de permissoes
UPDATE public.usuarios
   SET nome = 'Lorena'
 WHERE LOWER(TRIM(nome)) = 'alda lorena';

-- 3. area_responsaveis · onde ela e' responsavel default da area Integracao
--    (texto livre · ver CLAUDE.md secao "Responsaveis por area")
UPDATE public.area_responsaveis
   SET responsavel_nome = 'Lorena'
 WHERE LOWER(TRIM(responsavel_nome)) = 'alda lorena';

-- 4. Projects · onde aparece como leader/responsible
--    (CRITICO · escopo_proprio em /projetos compara profile.name com esses campos)
UPDATE public.projects
   SET leader = 'Lorena'
 WHERE LOWER(TRIM(leader)) = 'alda lorena';

UPDATE public.projects
   SET responsible = 'Lorena'
 WHERE LOWER(TRIM(responsible)) = 'alda lorena';

-- 5. Tasks · campo responsible em kanban_tasks/cycle_phase_tasks (texto livre)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='kanban_tasks') THEN
    UPDATE public.kanban_tasks
       SET responsible = 'Lorena'
     WHERE LOWER(TRIM(responsible)) = 'alda lorena';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='cycle_phase_tasks') THEN
    UPDATE public.cycle_phase_tasks
       SET responsavel_nome = 'Lorena'
     WHERE LOWER(TRIM(responsavel_nome)) = 'alda lorena';
  END IF;
END $$;

-- Conferencia:
-- SELECT 'profile' AS tabela, name FROM profiles WHERE LOWER(TRIM(name)) IN ('alda lorena', 'lorena');
-- SELECT 'usuarios' AS tabela, nome FROM usuarios WHERE LOWER(TRIM(nome)) IN ('alda lorena', 'lorena');
-- SELECT 'area' AS tabela, responsavel_nome FROM area_responsaveis WHERE LOWER(TRIM(responsavel_nome)) = 'lorena';
