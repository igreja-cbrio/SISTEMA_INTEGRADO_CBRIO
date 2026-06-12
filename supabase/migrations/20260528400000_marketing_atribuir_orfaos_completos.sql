-- ============================================================================
-- MIGRATION · Marketing · Atribui 4 orfaos concluidos pro Pedro (Spec 024)
-- ============================================================================
-- Spec 023 filtrou por estado IN (fila, em_producao, aguardando_solicitante)
-- · deixou 4 cards concluidos (historico do ciclo criativo) sem dono.
-- Pedro quer zero orfaos · atribui tudo pra ele agora.
-- ============================================================================

DO $$
DECLARE
  v_pedro_membro_id uuid;
  v_atualizados integer;
BEGIN
  SELECT id INTO v_pedro_membro_id
    FROM public.marketing_membros
   WHERE profile_id = 'daff0456-bb11-432c-be44-48ccc1a75465'  -- Pedro Paiva
     AND habilidade = 'coordenador'
     AND ativo = true
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_pedro_membro_id IS NULL THEN
    RAISE EXCEPTION 'Pedro membro nao encontrado · Spec 023 nao aplicada?';
  END IF;

  UPDATE public.marketing_kanban_cards
     SET atribuido_a = v_pedro_membro_id
   WHERE atribuido_a IS NULL
     AND deleted_at IS NULL;
  -- Sem filtro de estado dessa vez · pega tudo

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RAISE NOTICE 'Spec 024 · % cards orfaos restantes atribuidos ao Pedro', v_atualizados;
END $$;
