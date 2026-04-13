-- ============================================================
-- Migration 035: Cérebro CBRio
-- Base de conhecimento institucional — fila de processamento
-- e configuração do sistema de notas automáticas
-- ============================================================

-- Fila de arquivos pendentes de processamento
CREATE TABLE IF NOT EXISTS cerebro_fila (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  extensao TEXT NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  pasta_origem TEXT NOT NULL,
  biblioteca TEXT NOT NULL,
  sharepoint_url TEXT,
  last_modified TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'processando', 'concluido', 'erro', 'ignorado'
  )),
  nota_path TEXT,
  resumo TEXT,
  tags TEXT[],
  tokens_usados INTEGER DEFAULT 0,
  erro_mensagem TEXT,
  hash_arquivo TEXT,
  detectado_em TIMESTAMPTZ DEFAULT NOW(),
  processado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cerebro_fila_status ON cerebro_fila(status);
CREATE INDEX IF NOT EXISTS idx_cerebro_fila_item ON cerebro_fila(item_id, drive_id);
CREATE INDEX IF NOT EXISTS idx_cerebro_fila_bib ON cerebro_fila(biblioteca);

ALTER TABLE cerebro_fila ENABLE ROW LEVEL SECURITY;
CREATE POLICY cerebro_fila_all ON cerebro_fila FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Configuração do processador
CREATE TABLE IF NOT EXISTS cerebro_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  valor JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cerebro_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY cerebro_config_all ON cerebro_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Config padrão
INSERT INTO cerebro_config (chave, valor) VALUES
  ('extensoes_permitidas', '"pdf,xlsx,csv,docx,pptx,txt,md,json,png,jpg,jpeg"'),
  ('tamanho_minimo_bytes', '1024'),
  ('bibliotecas_monitoradas', '"Gestão,Criativo,Ministerial,Planejamento,CRM e Pessoas"'),
  ('vault_drive_name', '"Cerebro CBRio"')
ON CONFLICT (chave) DO NOTHING;

-- View para dashboard
CREATE OR REPLACE VIEW cerebro_stats AS
SELECT
  status,
  COUNT(*) as total,
  SUM(tokens_usados) as tokens_total,
  MAX(processado_em) as ultimo_processamento
FROM cerebro_fila
GROUP BY status;
