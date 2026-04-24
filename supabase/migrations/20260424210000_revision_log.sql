-- Log de alterações feitas pelo módulo de Revisão Estratégica.
-- Cada campo alterado gera uma linha — permite rastrear histórico completo.
CREATE TABLE IF NOT EXISTS revision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('projeto', 'expansao')),
  item_id UUID NOT NULL,
  item_nome TEXT,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  motivo TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revision_log_item ON revision_log(tipo, item_id);
CREATE INDEX IF NOT EXISTS idx_revision_log_date ON revision_log(created_at DESC);
