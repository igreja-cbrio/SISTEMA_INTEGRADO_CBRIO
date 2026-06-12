-- ============================================================================
-- Campo observacoes em cultos
--
-- Marcos: "nos lançamentos dos dados de culto preciso que seja implementado
-- uma coisa: adicionar descricao, para os lideres poderem colocar alguma
-- observacao daquele culto".
-- ============================================================================

ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS observacoes text;

COMMENT ON COLUMN public.cultos.observacoes IS
  'Notas livres do lider sobre o culto · evento especial, problema com som, '
  'pregador convidado, etc. Nao afeta nenhum KPI · apenas contexto humano.';

-- vw_culto_stats usa SELECT c.* logo a coluna nova ja entra automaticamente.
