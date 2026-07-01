-- ============================================================================
-- NPS · líderes de área ganham nível 3 (ver + editar) no módulo `nps`
--
-- Pedido do Marcos (2026-07-01): os líderes de área de culto (Arthur Cecconi/AMI,
-- Renata Martins/Online, Mariane Gaia/Kids, Lillian/Bridge) precisam acessar o
-- módulo NPS pra ver e EDITAR as pesquisas da SUA área (alterar NPS de culto,
-- editar perguntas, etc). Concede via CARGO (não por pessoa) → todo futuro líder
-- desses cargos herda o acesso automaticamente ("todos os líderes de área").
--
-- O ESCOPO POR ÁREA é aplicado no backend (routes/nps.js): cada líder vê/edita
-- só a NPS da sua área (usuario_areas). admin/diretor continuam vendo tudo.
-- Sede fica só com admin/diretor por ora (não há cargo/líder definido).
--
-- Idempotente. Aditivo (só eleva nível). Sem alteração de schema.
-- ============================================================================

-- Cargos de líder de área de culto que devem ter NPS nível 3.
-- (coordenador-sede NÃO existe · Sede fica com admin/diretor.)
DO $$
DECLARE
  v_mod_nps int;
BEGIN
  SELECT id INTO v_mod_nps FROM public.modulos WHERE slug = 'nps' LIMIT 1;
  IF v_mod_nps IS NULL THEN
    RAISE NOTICE 'modulo nps nao encontrado · nada a fazer';
    RETURN;
  END IF;

  -- Insere a linha da matriz onde não existe (ex.: coordenador-bridge estava sem
  -- linha = nível 0) já com nível 3.
  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT c.id, v_mod_nps, 3, false, false, false
    FROM public.cargos c
   WHERE c.slug IN ('coordenador-ami','coordenador-kids','coordenador-bridge','coordenador-online')
     AND NOT EXISTS (
       SELECT 1 FROM public.cargo_modulo_permissao x
        WHERE x.cargo_id = c.id AND x.modulo_id = v_mod_nps
     );

  -- Eleva pra 3 as linhas existentes que estavam abaixo (ex.: os demais em nível 2).
  UPDATE public.cargo_modulo_permissao cmp
     SET nivel = 3
    FROM public.cargos c
   WHERE cmp.cargo_id = c.id
     AND cmp.modulo_id = v_mod_nps
     AND c.slug IN ('coordenador-ami','coordenador-kids','coordenador-bridge','coordenador-online')
     AND cmp.nivel < 3;
END $$;
