-- Divergência de localização na revisão periódica (pedido do usuário
-- 2026-07-29, item 2): se o revisor encontra o bem fora da localização
-- esperada, o item NÃO é movido automaticamente. Depois de detectada a
-- divergência, o revisor escolhe: (a) mover de fato, com ressalva registrada
-- na aba de Movimentações (revisao_item_id, já existente desde o item 1); ou
-- (b) manter o bem na localização original só com um alerta ligado nele.

ALTER TABLE public.pat_revisao_itens
  ADD COLUMN IF NOT EXISTS localizacao_encontrada_id uuid REFERENCES public.pat_localizacoes(id),
  ADD COLUMN IF NOT EXISTS divergencia_acao text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pat_revisao_itens_divergencia_acao'
  ) THEN
    ALTER TABLE public.pat_revisao_itens
      ADD CONSTRAINT chk_pat_revisao_itens_divergencia_acao
      CHECK (divergencia_acao IS NULL OR divergencia_acao IN ('movido', 'alerta'));
  END IF;
END $$;

COMMENT ON COLUMN public.pat_revisao_itens.localizacao_encontrada_id IS
  'Onde o revisor de fato encontrou o bem, quando diferente da localização esperada (a da convocação). NULL = encontrado na localização esperada ou ainda não conferido.';
COMMENT ON COLUMN public.pat_revisao_itens.divergencia_acao IS
  'Decisão do revisor diante de uma divergência de localização: "movido" (bem realocado de fato, com movimentação registrada) ou "alerta" (mantido no lugar original, só sinalizado). NULL = sem divergência ou ainda não decidido.';

-- Alerta "ligado" no bem — pedido explícito do usuário: manter o bem na
-- localização original mas com aviso visível até alguém tratar. Aponta pro
-- item de revisão que originou o alerta; NULL = sem alerta ativo.
ALTER TABLE public.pat_bens
  ADD COLUMN IF NOT EXISTS alerta_divergencia_item_id uuid REFERENCES public.pat_revisao_itens(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pat_bens.alerta_divergencia_item_id IS
  'Aponta pro pat_revisao_itens que registrou "encontrado em outro lugar, manter alerta" — o bem segue na localização original. NULL = sem alerta ativo. Limpo quando o cadastro do bem é editado/movimentado deliberadamente ou quando alguém dispensa o alerta.';
