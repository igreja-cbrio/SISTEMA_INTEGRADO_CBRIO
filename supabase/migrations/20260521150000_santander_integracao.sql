-- Santander Open Banking · integracao inicial (saldo + extrato + comprovantes)
-- Idempotente · pode rodar varias vezes sem efeito colateral

-- 1. Cache do access_token OAuth (1 linha por ambiente)
CREATE TABLE IF NOT EXISTS santander_oauth_tokens (
  ambiente text PRIMARY KEY CHECK (ambiente IN ('homologacao', 'producao')),
  access_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  expires_at timestamptz NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Snapshot diario de saldo (1 por dia · alimenta grafico de tendencia)
CREATE TABLE IF NOT EXISTS santander_saldo_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  available_amount numeric(18,2) NOT NULL,
  blocked_amount numeric(18,2) DEFAULT 0,
  invested_amount numeric(18,2) DEFAULT 0,
  currency text DEFAULT 'BRL',
  raw_response jsonb,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data)
);

-- 3. Cache do extrato (TTL curto · evita estourar quota)
CREATE TABLE IF NOT EXISTS santander_extrato_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  conteudo jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  UNIQUE (data_inicio, data_fim)
);

CREATE INDEX IF NOT EXISTS santander_extrato_cache_expires_idx
  ON santander_extrato_cache(expires_at);

-- 4. Comprovantes baixados (PDF salvo em storage)
CREATE TABLE IF NOT EXISTS santander_comprovantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL UNIQUE,
  payment_date date,
  category text,                  -- PIX, TED, BOLETOS, TRIBUTOS, DOC, TRANSFERENCIAS-OUTRAS, DEBITO-AUTOMATICO, CONCESSIONARIAS
  channel text,
  amount numeric(18,2),
  payer_document text,
  payee_name text,
  storage_path text,              -- caminho dentro do bucket santander-comprovantes
  file_request_id text,           -- ultimo request_id usado pra baixar
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'requested', 'baixado', 'erro', 'expirado')),
  status_message text,
  vinculo_transacao_id uuid,      -- FK soft pra fin_transacoes (sem ref pra nao quebrar)
  vinculo_pagar_id uuid,          -- FK soft pra fin_contas_pagar
  raw_metadata jsonb,             -- resposta crua da API
  baixado_em timestamptz,
  baixado_por uuid REFERENCES profiles(id),
  vinculado_em timestamptz,
  vinculado_por uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS santander_comprovantes_payment_date_idx
  ON santander_comprovantes(payment_date DESC);
CREATE INDEX IF NOT EXISTS santander_comprovantes_status_idx
  ON santander_comprovantes(status);
CREATE INDEX IF NOT EXISTS santander_comprovantes_vinculo_trans_idx
  ON santander_comprovantes(vinculo_transacao_id) WHERE vinculo_transacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS santander_comprovantes_vinculo_pagar_idx
  ON santander_comprovantes(vinculo_pagar_id) WHERE vinculo_pagar_id IS NOT NULL;

-- 5. Bulk orders · gera PDFs em massa de um periodo
CREATE TABLE IF NOT EXISTS santander_bulk_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  alias text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  category_codes text[],
  status text NOT NULL DEFAULT 'STARTED'
    CHECK (status IN ('STARTED', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  pre_receipt_count int,
  receipt_count int,
  files jsonb,
  error_message text,
  criado_por uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS santander_bulk_orders_status_idx ON santander_bulk_orders(status);

-- 6. Log de chamadas (debug + auditoria)
CREATE TABLE IF NOT EXISTS santander_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code int,
  duration_ms int,
  trace_id text,
  error_message text,
  request_summary jsonb,
  user_id uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS santander_sync_log_created_at_idx
  ON santander_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS santander_sync_log_endpoint_idx
  ON santander_sync_log(endpoint);

-- 7. Bucket privado pros PDFs (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('santander-comprovantes', 'santander-comprovantes', false)
ON CONFLICT (id) DO NOTHING;

-- 8. Trigger pra atualizar updated_at em comprovantes/bulk
CREATE OR REPLACE FUNCTION santander_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_santander_comprovantes_touch ON santander_comprovantes;
CREATE TRIGGER tg_santander_comprovantes_touch
  BEFORE UPDATE ON santander_comprovantes
  FOR EACH ROW EXECUTE FUNCTION santander_touch_updated_at();

DROP TRIGGER IF EXISTS tg_santander_bulk_orders_touch ON santander_bulk_orders;
CREATE TRIGGER tg_santander_bulk_orders_touch
  BEFORE UPDATE ON santander_bulk_orders
  FOR EACH ROW EXECUTE FUNCTION santander_touch_updated_at();
