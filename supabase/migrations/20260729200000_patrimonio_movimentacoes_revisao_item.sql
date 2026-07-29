-- Aba central de Movimentações do Patrimônio (pedido do usuário 2026-07-29,
-- item 1): histórico de TODAS as movimentações de TODOS os bens, com destaque
-- pras que vieram de uma revisão agendada. Esta coluna é o sinalizador —
-- presença de revisao_item_id = "veio de revisão". A escrita real dela
-- (quando o revisor escolhe "mover mesmo assim" numa divergência) é o item 2,
-- ainda não implementado; a coluna entra agora pra já existir schema pronto
-- e a aba central já saber exibir o destaque assim que for populada.

ALTER TABLE public.pat_movimentacoes
  ADD COLUMN IF NOT EXISTS revisao_item_id uuid REFERENCES public.pat_revisao_itens(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pat_movimentacoes.revisao_item_id IS
  'Preenchido quando a movimentação foi gerada a partir de uma divergência de localização detectada numa revisão periódica (item 2 do pedido de 2026-07-29). NULL = movimentação comum.';

CREATE INDEX IF NOT EXISTS idx_pat_movimentacoes_revisao_item ON public.pat_movimentacoes (revisao_item_id) WHERE revisao_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pat_movimentacoes_data ON public.pat_movimentacoes (data_movimentacao DESC);
