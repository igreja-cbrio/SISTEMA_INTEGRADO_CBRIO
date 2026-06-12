-- ============================================================================
-- Mapeia NEXT-01, NEXT-02, NEXT-03 para coletores automaticos.
-- NEXT-04 (NPS) continua manual (depende de questionario aplicado).
-- ============================================================================

UPDATE kpi_indicadores_taticos SET fonte_auto = 'next.batismos',     updated_at = now() WHERE id = 'NEXT-01';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'next.voluntarios',  updated_at = now() WHERE id = 'NEXT-02';
UPDATE kpi_indicadores_taticos SET fonte_auto = 'next.dizimo',       updated_at = now() WHERE id = 'NEXT-03';

-- Verificacao:
-- SELECT id, indicador, fonte_auto FROM kpi_indicadores_taticos WHERE id LIKE 'NEXT-%' ORDER BY id;
