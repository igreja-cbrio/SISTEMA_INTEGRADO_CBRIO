-- ============================================================================
-- Auto-collector alimenta processo_registros (modulo de Processos)
--
-- Adiciona origem (manual|auto) e periodo_referencia em processo_registros
-- para que o coletor automatico possa gravar valores ali tambem.
--
-- Estrategia transicional: o coletor grava em AMBAS as tabelas
-- (kpi_registros + processo_registros) ate o /kpis migrar a view de
-- leitura. Isso evita downtime e mantem a UI atual funcionando.
-- ============================================================================

ALTER TABLE processo_registros
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual', 'auto'));

ALTER TABLE processo_registros
  ADD COLUMN IF NOT EXISTS periodo_referencia TEXT;

-- Backfill periodo_referencia a partir de periodo (se nulo)
UPDATE processo_registros
SET periodo_referencia = periodo
WHERE periodo_referencia IS NULL AND periodo IS NOT NULL;

-- Unique para auto-coletados: evita duplicar mesmo valor no mesmo
-- (processo, indicador, periodo) quando o cron roda multiplas vezes
CREATE UNIQUE INDEX IF NOT EXISTS uq_processo_registros_auto
  ON processo_registros(processo_id, indicador_id, periodo_referencia)
  WHERE origem = 'auto';

CREATE INDEX IF NOT EXISTS idx_processo_registros_periodo
  ON processo_registros(periodo_referencia);

CREATE INDEX IF NOT EXISTS idx_processo_registros_origem
  ON processo_registros(origem);
