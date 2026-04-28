-- ============================================================================
-- KPIs V2 - Coluna fonte_auto + seed dos coletores automaticos
--
-- Identifica indicadores que podem ser preenchidos automaticamente pelo
-- sistema (cron) a partir de outros modulos. O backend (kpiAutoCollector.js)
-- usa esse identificador para saber qual funcao chamar.
-- ============================================================================

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS fonte_auto TEXT;

COMMENT ON COLUMN kpi_indicadores_taticos.fonte_auto IS
  'Identificador da fonte automatica. NULL = lancamento manual. Ex: cultos.amibridge_freq, cuidados.jornada180.';

-- ============================================================================
-- Mapeamento dos 14 indicadores AUTO
-- ============================================================================

-- De cultos
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cultos.amibridge_freq', updated_at = now() WHERE id = 'AMI-01';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cultos.amibridge_conv', updated_at = now() WHERE id = 'AMI-02';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cultos.kids_freq',      updated_at = now() WHERE id = 'KID-01';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cultos.conv_visit',     updated_at = now() WHERE id = 'INTG-01';

-- De cuidados
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cuidados.convertidos_pos_culto', updated_at = now() WHERE id = 'CUID-01';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cuidados.engajados_valor',       updated_at = now() WHERE id = 'CUID-05';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cuidados.jornada180',            updated_at = now() WHERE id = 'CUID-07';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cuidados.atendimentos_pastorais', updated_at = now() WHERE id = 'CUID-10';

-- De grupos
UPDATE kpi_indicadores_taticos SET fonte_auto = 'grupos.participantes', updated_at = now() WHERE id = 'GRUP-01';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'grupos.total_grupos',  updated_at = now() WHERE id = 'GRUP-04';

-- De voluntariado / Planning Center
UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.ativos',   updated_at = now() WHERE id = 'VOL-02';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.escalados', updated_at = now() WHERE id = 'VOL-06';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.funil',    updated_at = now() WHERE id = 'VOL-04';

-- De batismos (com filtro Kids)
UPDATE kpi_indicadores_taticos SET fonte_auto = 'batismos.kids',         updated_at = now() WHERE id = 'KID-02';

-- ============================================================================
-- Coluna em kpi_registros para marcar lancamento automatico
-- ============================================================================
ALTER TABLE kpi_registros
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem IN ('manual', 'auto'));

COMMENT ON COLUMN kpi_registros.origem IS
  'Origem do lancamento: manual (humano) ou auto (cron/coletor).';

CREATE INDEX IF NOT EXISTS idx_kpi_registros_origem ON kpi_registros(origem);

-- ============================================================================
-- Verificacao:
--   SELECT count(*) FROM kpi_indicadores_taticos WHERE fonte_auto IS NOT NULL;
--   -- deve retornar 14
-- ============================================================================
