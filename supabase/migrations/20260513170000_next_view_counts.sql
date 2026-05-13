-- ============================================================================
-- NEXT - View de contagens agregadas por evento
--
-- Substitui a logica antiga do backend que listava todas as next_inscricoes
-- e contava em memoria — quebrou com o backfill historico (2.4k+ rows
-- > limite default de 1000 do supabase). Agora o backend faz UMA query
-- nesta view, retornando 1 linha por evento ja agregada.
-- ============================================================================

CREATE OR REPLACE VIEW vw_next_eventos_counts AS
SELECT
  e.id AS evento_id,
  e.data,
  COUNT(ni.id) AS inscritos,
  COUNT(ni.check_in_at) AS checkins,
  COUNT(*) FILTER (WHERE ni.origem_lista = 'impressa') AS inscritos_impressa,
  COUNT(*) FILTER (WHERE ni.origem_lista = 'manuscrito') AS inscritos_manuscrito,
  COUNT(*) FILTER (WHERE ni.origem_lista = 'impressa' AND ni.check_in_at IS NOT NULL) AS presentes_impressa_count,
  COUNT(*) FILTER (WHERE ni.origem_lista = 'manuscrito' AND ni.check_in_at IS NOT NULL) AS presentes_manuscrito_count
FROM next_eventos e
LEFT JOIN next_inscricoes ni ON ni.evento_id = e.id
GROUP BY e.id, e.data;

COMMENT ON VIEW vw_next_eventos_counts IS
  'Contagens agregadas de inscritos/check-ins por evento NEXT, com breakdown por origem_lista. Usada pelo GET /api/next/eventos para evitar limite de 1000 rows do supabase ao contar 2.4k+ inscricoes.';
