-- ============================================================================
-- Voluntariado · "Área direcionada" da inscrição (2026-06-30)
-- ----------------------------------------------------------------------------
-- Até aqui a inscrição guardava só `ministerios_interesse` (texto livre do que
-- a pessoa PEDIU pra servir). Faltava registrar pra onde ela foi DE FATO
-- direcionada — que às vezes é a 2ª/3ª opção, ou um ministério diferente do
-- pedido. Esta coluna guarda essa lista (pode ser mais de um · ex.: Louvor,
-- Cuidados, Integração) e preserva o histórico "pediu X, foi pra Y".
--
-- Aditiva e idempotente · não altera comportamento existente. A coordenação
-- preenche pela ficha da inscrição (tela /ministerial/voluntariado/inscricoes).
-- ============================================================================

ALTER TABLE public.vol_inscricoes
  ADD COLUMN IF NOT EXISTS area_direcionada text[];

COMMENT ON COLUMN public.vol_inscricoes.area_direcionada IS
  'Ministérios onde a pessoa foi de fato direcionada a servir (multi-seleção). Distinto de ministerios_interesse (o que ela pediu na inscrição).';
