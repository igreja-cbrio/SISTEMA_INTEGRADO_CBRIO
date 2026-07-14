-- ============================================================================
-- Solicitações · fotos anexadas no intake (2026-07-07)
-- ============================================================================
-- Pedido do Marcos: em Serviços (manutenção interna) e Serviço externo
-- (contratação/cotação), o solicitante pode anexar fotos pra quem atende/cota
-- avaliar melhor (goteira, equipamento quebrado, referência do serviço).
-- Compras já tem foto POR ITEM (solicitacao_itens.imagem_url) — este campo é
-- o anexo GERAL da solicitação.
--
-- Aditiva e idempotente. Array JSONB de URLs públicas do bucket 'solicitacoes'
-- (bucket + policies de upload/leitura criados em 20260623200000_solicitacao_itens.sql).
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS imagens_url jsonb;

COMMENT ON COLUMN public.solicitacoes.imagens_url IS
  'Array JSONB de URLs de fotos anexadas no intake (bucket solicitacoes/fotos) · avaliadas por quem atende/cota';
