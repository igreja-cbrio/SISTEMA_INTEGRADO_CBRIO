-- FIX · adiciona 'contribuinte_avulso' ao CHECK do mem_membros.status
-- Bug visto 2026-05-22 · classificarBatch (financeiroClassificador.js)
-- cria membro automatico a partir de PIX/extrato com status='contribuinte_avulso'
-- (alguem que apareceu no extrato mas nao e' membro formal). CHECK constraint
-- nao tinha esse valor. Cadeia de falha: INSERT mem_membros → CHECK violado →
-- tudo aborta → HTTP 500 no sync de extrato.

ALTER TABLE mem_membros
  DROP CONSTRAINT IF EXISTS mem_membros_status_check;

ALTER TABLE mem_membros
  ADD CONSTRAINT mem_membros_status_check
  CHECK (status IN (
    'visitante', 'frequentador', 'membro', 'membro_ativo',
    'inativo', 'transferido', 'contribuinte_avulso'
  ));

COMMIT;
