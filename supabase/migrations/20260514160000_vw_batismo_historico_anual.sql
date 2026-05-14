-- ============================================================================
-- Historico anual de batismos · alimentar aba Historico da Integracao
--
-- Marcos: "coloque um filtro dos tres dados, pra esse grafico, a pessoa pode
--          selecionar se quer ver aceitacoes, batismos ou frequencia"
--
-- Agregacao por ano · so status='realizado' (cancelados ignorados).
-- Usa COALESCE(data_batismo, created_at::date) porque data_batismo pode ser
-- null em registros antigos · created_at e sempre populado.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_batismo_historico_anual AS
SELECT
  EXTRACT(YEAR FROM COALESCE(data_batismo, created_at::date))::int AS ano,
  COUNT(*)::int AS total_batismos
FROM public.batismo_inscricoes
WHERE status = 'realizado'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.vw_batismo_historico_anual IS
  'Total de batismos realizados por ano · usado na aba Historico da Integracao';

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT * FROM vw_batismo_historico_anual;
-- ============================================================================
