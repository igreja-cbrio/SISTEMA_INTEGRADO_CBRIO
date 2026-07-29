-- Hierarquia de localizações do Patrimônio (pedido do usuário 2026-07-29):
-- pai_id já existia em pat_localizacoes mas nunca foi usado (coluna morta,
-- nunca lida pelo frontend). Esta migration semeia a árvore real da igreja
-- (Coreto/Bloco 3/Bloco 4/Subsolo → CBKids/Templo/etc → salas), fornecida
-- pelo usuário linha a linha, e sinaliza bens que ficaram "órfãos" (apontando
-- pra um nó que virou grupo/pai, não mais uma sala final) para reavaliação
-- manual — decisão do usuário: NUNCA realocar bem existente automaticamente.
--
-- Idempotente: cada localização é find-or-create por (nome, pai_id) — CBKids
-- aparece de propósito sob 3 pais físicos diferentes (Coreto/Bloco 4/Bloco 3),
-- então NÃO pode ser find-or-create só por nome.

ALTER TABLE public.pat_bens
  ADD COLUMN IF NOT EXISTS localizacao_pendente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pat_bens.localizacao_pendente IS
  'true = bem aponta pra uma localização que virou grupamento (tem filhas) após a introdução da hierarquia; precisa de realocação manual pra uma sala final.';

CREATE OR REPLACE FUNCTION public._pat_loc_upsert_2026072910(p_nome text, p_pai uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pat_localizacoes
    WHERE nome = p_nome AND pai_id IS NOT DISTINCT FROM p_pai;
  IF v_id IS NULL THEN
    INSERT INTO public.pat_localizacoes (nome, pai_id) VALUES (p_nome, p_pai) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

DO $$
DECLARE
  coreto uuid; bloco3 uuid; bloco4 uuid; subsolo uuid;
  coreto_cbkids uuid; bloco4_cbkids uuid; bloco3_cbkids uuid; subsolo_templo uuid;
BEGIN
  -- Nível 1 · agrupamentos maiores
  coreto  := public._pat_loc_upsert_2026072910('Coreto', NULL);
  bloco3  := public._pat_loc_upsert_2026072910('Bloco 3', NULL);
  bloco4  := public._pat_loc_upsert_2026072910('Bloco 4', NULL);
  subsolo := public._pat_loc_upsert_2026072910('Subsolo', NULL);

  -- Nível 2 · CBKids existe sob 3 blocos físicos diferentes (nós distintos)
  coreto_cbkids := public._pat_loc_upsert_2026072910('CBKids', coreto);
  bloco4_cbkids := public._pat_loc_upsert_2026072910('CBKids', bloco4);
  bloco3_cbkids := public._pat_loc_upsert_2026072910('CBKids', bloco3);
  subsolo_templo := public._pat_loc_upsert_2026072910('Templo', subsolo);

  -- Nível 2 · grupos do Bloco 3 sem sala-filha (a própria linha é a alocável)
  PERFORM public._pat_loc_upsert_2026072910('Cozinha', bloco3);
  PERFORM public._pat_loc_upsert_2026072910('Secretaria', bloco3);
  PERFORM public._pat_loc_upsert_2026072910('Sala Voluntariado', bloco3);
  PERFORM public._pat_loc_upsert_2026072910('Espaço Next', bloco3);

  -- Nível 3 · salas do Coreto/CBKids
  PERFORM public._pat_loc_upsert_2026072910('Sala 2', coreto_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 3 e 4', coreto_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Lounge CBKids', coreto_cbkids);

  -- Nível 3 · salas do Bloco 4/CBKids
  PERFORM public._pat_loc_upsert_2026072910('Sala 5', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 6', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 7', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 8', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 9 e 11', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 10', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 12', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Sala 13', bloco4_cbkids);
  PERFORM public._pat_loc_upsert_2026072910('Copa CBKids', bloco4_cbkids);

  -- Nível 3 · Bloco 3/CBKids
  PERFORM public._pat_loc_upsert_2026072910('Espaço CBRio', bloco3_cbkids);

  -- Nível 3 · Subsolo/Templo
  PERFORM public._pat_loc_upsert_2026072910('Salão Principal do Templo', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Livraria', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Almoxarifado', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Sala dos Pastores', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Oficina', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Banheiros', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Sala Transmissão', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Sala Online', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Sala Sicon', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Sala TI Principal', subsolo_templo);
  PERFORM public._pat_loc_upsert_2026072910('Sala TI Anexo', subsolo_templo);
END $$;

-- Bem que aponta pra um nó que virou GRUPO (agora tem filhas) fica marcado
-- pra realocação manual — nunca move sozinho (lei do usuário 2026-07-29).
UPDATE public.pat_bens b
SET localizacao_pendente = true
WHERE b.localizacao_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.pat_localizacoes child WHERE child.pai_id = b.localizacao_id)
  AND b.localizacao_pendente = false;

DROP FUNCTION public._pat_loc_upsert_2026072910(text, uuid);
