-- Adiciona campos de limite (cheque especial) ao snapshot diario do Santander
-- Idempotente

ALTER TABLE santander_saldo_snapshot
  ADD COLUMN IF NOT EXISTS overdraft_limit numeric(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdraft_used numeric(18, 2) DEFAULT 0;

COMMIT;
