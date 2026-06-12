-- FIX · CHECK constraint de fin_transacoes.classificacao_origem ficou
-- defasado depois que a fila passou a sugerir memoria_documento e
-- memoria_nome (PR #638, migration 20260522250000). Quando o user aprova
-- um item da memoria pela fila, financeiroV2.js linha 629 propaga o
-- sugestao_origem original pra fin_transacoes · INSERT batia no CHECK
-- antigo e abortava com:
--   new row for relation "fin_transacoes" violates check constraint
--   "fin_transacoes_classificacao_origem_check"
--
-- Caso real 2026-05-26 · KB SOLUCOES CONSTRUTIVAS · aprovacao da fila
-- Vieram da memoria.

ALTER TABLE fin_transacoes
  DROP CONSTRAINT IF EXISTS fin_transacoes_classificacao_origem_check;

ALTER TABLE fin_transacoes
  ADD CONSTRAINT fin_transacoes_classificacao_origem_check
  CHECK (classificacao_origem IS NULL OR classificacao_origem IN (
    'manual', 'centavo', 'memoria', 'memoria_documento', 'memoria_nome',
    'regra', 'ia', 'pix_match'
  ));

COMMIT;
