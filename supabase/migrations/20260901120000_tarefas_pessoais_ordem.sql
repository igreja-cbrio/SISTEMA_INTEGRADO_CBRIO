-- ============================================================================
-- Minhas Tarefas · ordem manual das tarefas (2026-09-01)
--
-- Pedido do Matheus: "ter botões de mover para cima e mover para baixo, para
-- reorganizar a sequência sem precisar excluir e criar de novo".
--
-- ⚠️ NULLABLE e SEM default de propósito: `NULL` = "nunca foi reordenada", e a
-- ordenação a joga pro fim do grupo (NULLS LAST). Um default 0 faria TODA
-- tarefa existente empatar em zero, e o desempate cairia num critério
-- arbitrário — a lista mudaria de ordem sozinha no dia do deploy, sem ninguém
-- ter pedido.
--
-- ⚠️ O valor é o ÍNDICE DENTRO DO GRUPO da tela (Atrasadas · Hoje · Próximos 7
-- dias · Mais tarde · Sem prazo), não uma ordem global: a tela agrupa por
-- prazo, e é dentro do grupo que "mover pra cima" tem sentido. Dois grupos
-- podem ter a mesma sequência 0,1,2 — o `data` desempata, e o agrupamento do
-- front preserva a ordem relativa.
--
-- Aditiva e idempotente. Sem ela, a lista segue ordenada por data/horário.
-- ============================================================================

ALTER TABLE public.tarefas_pessoais
  ADD COLUMN IF NOT EXISTS ordem INTEGER;

COMMENT ON COLUMN public.tarefas_pessoais.ordem IS
  'Posicao manual DENTRO do grupo de prazo da tela /tarefas (0-based). NULL = nunca reordenada, vai pro fim do grupo (NULLS LAST). Nao e ordem global: grupos diferentes repetem 0,1,2 e o campo `data` desempata.';

-- Ordenação da lista: quem tem posição manual primeiro, depois data e horário.
CREATE INDEX IF NOT EXISTS idx_tarefas_pessoais_ordem
  ON public.tarefas_pessoais (created_by, ordem NULLS LAST, data NULLS LAST);
