-- Adiciona campo cnpj em mem_membros pra suportar contribuintes PJ identificados
-- via OFX/PIX (CNPJ extraido do MEMO das transacoes)
-- Idempotente

ALTER TABLE mem_membros
  ADD COLUMN IF NOT EXISTS cnpj text;

CREATE INDEX IF NOT EXISTS mem_membros_cnpj_idx ON mem_membros(cnpj) WHERE cnpj IS NOT NULL;

-- Constraint UNIQUE soft (so quando cnpj IS NOT NULL · evita conflito com null existentes)
CREATE UNIQUE INDEX IF NOT EXISTS mem_membros_cnpj_uniq ON mem_membros(cnpj) WHERE cnpj IS NOT NULL;

COMMIT;
