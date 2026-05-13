-- ============================================================================
-- NEXT - origem_lista (impressa | manuscrito) e totais consolidados do dia
--
-- Backfill historico (Jan/2025 - Abr/2026, 48 encontros, 739 pessoas, 2443
-- registros) traz duas dimensoes que o schema atual nao cobre:
--   1. Distincao entre quem estava na lista impressa do dia x quem chegou e
--      foi anotado a mao (manuscrito) -- sinal de planejamento de inscricoes.
--   2. Totais consolidados do dia (lista, presentes impressa, presentes
--      manuscritos) para nao precisar agregar de inscricoes em queries de
--      dashboard.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. next_eventos: totais consolidados + arquivo de origem
-- ----------------------------------------------------------------------------
ALTER TABLE next_eventos
  ADD COLUMN IF NOT EXISTS total_lista INT,
  ADD COLUMN IF NOT EXISTS presentes_impressa INT,
  ADD COLUMN IF NOT EXISTS presentes_manuscritos INT,
  ADD COLUMN IF NOT EXISTS arquivo_origem TEXT;

COMMENT ON COLUMN next_eventos.total_lista IS
  'Total de pessoas na lista impressa do dia (snapshot historico do roster).';
COMMENT ON COLUMN next_eventos.presentes_impressa IS
  'Quantos da lista impressa fizeram check-in.';
COMMENT ON COLUMN next_eventos.presentes_manuscritos IS
  'Quantos foram anotados a mao no dia (walk-in, nao estavam na lista).';
COMMENT ON COLUMN next_eventos.arquivo_origem IS
  'Nome do arquivo PDF/scan que originou o registro (rastreabilidade).';

-- View para % de comparecimento sem precisar recalcular em cada query
CREATE OR REPLACE VIEW vw_next_eventos_stats AS
SELECT
  e.id,
  e.data,
  e.titulo,
  e.status,
  e.total_lista,
  e.presentes_impressa,
  e.presentes_manuscritos,
  COALESCE(e.presentes_impressa, 0) + COALESCE(e.presentes_manuscritos, 0) AS total_presentes,
  CASE
    WHEN COALESCE(e.total_lista, 0) > 0
    THEN ROUND(100.0 * COALESCE(e.presentes_impressa, 0) / e.total_lista, 1)
    ELSE NULL
  END AS pct_comparecimento_lista,
  e.observacoes,
  e.arquivo_origem,
  e.created_at,
  e.updated_at
FROM next_eventos e;

-- ----------------------------------------------------------------------------
-- 2. next_inscricoes: origem_lista (impressa | manuscrito)
--
-- 'origem' (existente) e 'formulario' vs 'manual' (como o registro entrou
-- no SISTEMA). 'origem_lista' e 'impressa' vs 'manuscrito' (como a pessoa
-- chegou ao EVENTO no dia). Sao dimensoes diferentes.
-- ----------------------------------------------------------------------------
ALTER TABLE next_inscricoes
  ADD COLUMN IF NOT EXISTS origem_lista TEXT
    CHECK (origem_lista IN ('impressa', 'manuscrito'));

COMMENT ON COLUMN next_inscricoes.origem_lista IS
  'Como a pessoa chegou ao evento: impressa (estava na lista pre-impressa do dia) ou manuscrito (anotada a mao na chegada).';

CREATE INDEX IF NOT EXISTS idx_next_insc_origem_lista
  ON next_inscricoes(origem_lista)
  WHERE origem_lista IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Unique parcial: evita duplicar inscricao do mesmo membro no mesmo evento
--    (necessario para idempotencia do backfill historico).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_insc_evento_membro
  ON next_inscricoes(evento_id, membro_id)
  WHERE evento_id IS NOT NULL AND membro_id IS NOT NULL;
