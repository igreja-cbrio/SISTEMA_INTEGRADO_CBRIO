-- ============================================================================
-- MIGRATION · Marketing · Pedro membro + atribuir orfaos (Spec 023)
-- ============================================================================
-- Marcos: "coloque tambem Pedro Paiva como uma das pessoas nesse calendario
-- e coloque todas as tarefas sem dono para ele, ai ele vai conseguir ver o
-- que precisa ser entregue e que nao tem dono."
--
-- 1. Adiciona 'coordenador' no CHECK constraint de habilidade
--    (Pedro nao se encaixa em videomaker/fotografo/designer/social_media)
-- 2. Cadastra Pedro Paiva em marketing_membros · habilidade=coordenador · 40h
-- 3. Atribui todos os cards orfaos (atribuido_a IS NULL) pro Pedro
--    · 105 cards do ciclo criativo + qualquer outro sem dono
--    · Capacidade dele: Spec 018 garante que so cards do topo da fila
--      contam pra capacidade da semana · Pedro nao explode mesmo com 105
--      cards atribuidos
-- ============================================================================

-- 1. Atualiza CHECK constraint habilidade (adiciona 'coordenador')
ALTER TABLE public.marketing_membros
  DROP CONSTRAINT IF EXISTS marketing_membros_habilidade_check;

ALTER TABLE public.marketing_membros
  ADD CONSTRAINT marketing_membros_habilidade_check CHECK (
    habilidade IN (
      'videomaker',
      'fotografo',
      'designer',
      'social_media',
      'social_media_assistente',
      'coordenador'
    )
  );

-- Tambem atualiza CHECK em marketing_etiquetas_tipo.habilidade_padrao
-- (mesma logica · etiquetas podem ter coordenador como habilidade sugerida)
ALTER TABLE public.marketing_etiquetas_tipo
  DROP CONSTRAINT IF EXISTS marketing_etiquetas_tipo_habilidade_padrao_check;

ALTER TABLE public.marketing_etiquetas_tipo
  ADD CONSTRAINT marketing_etiquetas_tipo_habilidade_padrao_check CHECK (
    habilidade_padrao IS NULL OR habilidade_padrao IN (
      'videomaker',
      'fotografo',
      'designer',
      'social_media',
      'social_media_assistente',
      'coordenador'
    )
  );

-- 2. Cadastra Pedro Paiva em marketing_membros (idempotent)
INSERT INTO public.marketing_membros
  (profile_id, habilidade, horas_semanais, observacao, ativo)
VALUES (
  'daff0456-bb11-432c-be44-48ccc1a75465',  -- Pedro Paiva
  'coordenador',
  40,
  'Pedro Paiva · coordenador Marketing · ponto focal pra cards sem dono ate distribuir',
  true
)
ON CONFLICT (profile_id, habilidade) DO UPDATE
  SET ativo = true,
      horas_semanais = EXCLUDED.horas_semanais,
      observacao = EXCLUDED.observacao,
      updated_at = now();

-- 3. Atribui orfaos pro Pedro
DO $$
DECLARE
  v_pedro_membro_id uuid;
  v_atualizados integer;
BEGIN
  SELECT id INTO v_pedro_membro_id
    FROM public.marketing_membros
   WHERE profile_id = 'daff0456-bb11-432c-be44-48ccc1a75465'
     AND habilidade = 'coordenador'
     AND ativo = true
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_pedro_membro_id IS NULL THEN
    RAISE EXCEPTION 'Pedro membro nao encontrado · INSERT acima falhou?';
  END IF;

  UPDATE public.marketing_kanban_cards
     SET atribuido_a = v_pedro_membro_id
   WHERE atribuido_a IS NULL
     AND deleted_at IS NULL
     AND estado IN ('fila','em_producao','aguardando_solicitante');

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RAISE NOTICE 'Spec 023 · % cards orfaos atribuidos ao Pedro Paiva (membro_id %)', v_atualizados, v_pedro_membro_id;
END $$;
