-- Geração progressiva de relatórios IA: cada seção é gerada por uma chamada
-- separada (Haiku, ~5-15s cada), evitando o timeout de 60s do Vercel Hobby
-- e dando UX progressiva. As 7 seções são salvas em event_reports.sections
-- (jsonb). O input_data fica congelado em event_reports.input_data pra
-- garantir que todas as 7 chamadas usem os mesmos dados (snapshot no /start).
--
-- Backward compat: linhas antigas têm status='ready' (default), sections={}
-- (vazio), input_data=null. O .content continua sendo usado pelo /report/export
-- e exibido pelo frontend exatamente como antes.

ALTER TABLE event_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'streaming', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS section_errors JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS input_data JSONB,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Index pra polling: status + event_id (cliente lista pendentes do evento)
CREATE INDEX IF NOT EXISTS idx_event_reports_status_event
  ON event_reports (event_id, status, created_at DESC);

COMMENT ON COLUMN event_reports.status IS
  'Lifecycle: pending (sem seção) → streaming (>=1 seção gerada) → ready (finalizado) | error (falha após retries)';
COMMENT ON COLUMN event_reports.sections IS
  'JSONB { resumo_executivo, progresso_por_fase, entregas_por_area, cards_pendentes, observacoes_responsaveis, pontos_atencao, recomendacoes }. Cada chave salva quando a seção termina.';
COMMENT ON COLUMN event_reports.section_errors IS
  'Por seção: { resumo_executivo: "msg do erro" }. Limpo no retry com sucesso.';
COMMENT ON COLUMN event_reports.input_data IS
  'Snapshot dos dados de entrada (anexos, completions, pending, progress, totais) congelado no /start. Garante consistência entre as 7 chamadas de seção.';
