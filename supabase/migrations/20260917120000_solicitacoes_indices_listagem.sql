-- Otimização da listagem de /solicitacoes (2026-09-17)
--
-- A aba de solicitações estava lenta: a query principal filtra
-- `deleted_at IS NULL` + `updated_at >= <corte do período>` e ordena por
-- `created_at DESC`, sem nenhum índice cobrindo esse padrão — full scan
-- (ou pior, ordenação sem uso de índice) conforme a tabela cresce.
--
-- Dois índices parciais (só linhas vivas), cobrindo os dois caminhos reais:
--   1. listagem normal (filtra + ordena por updated_at, que é a mesma coluna
--      do corte de período)
--   2. fila de aprovação e período "tudo" (sem filtro de updated_at, ordena
--      só por created_at)
--
-- Aditiva e idempotente. Sem CONCURRENTLY: a tabela de solicitações é
-- pequena o bastante pra um lock breve na criação (mesma tela de outros
-- índices já criados nela em produção sem CONCURRENTLY).

CREATE INDEX IF NOT EXISTS idx_solicitacoes_ativo_updated_created
  ON public.solicitacoes (updated_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_ativo_created
  ON public.solicitacoes (created_at DESC)
  WHERE deleted_at IS NULL;
