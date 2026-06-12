-- fin_metas · tipo de visualizacao (gauge / barra)
-- Espelha padrao usado em DashMetasAba (Dashboard Semanal Ministerial)
-- Idempotente.

ALTER TABLE fin_metas
  ADD COLUMN IF NOT EXISTS tipo_grafico text DEFAULT 'gauge'
    CHECK (tipo_grafico IN ('gauge', 'barra'));

UPDATE fin_metas SET tipo_grafico = 'gauge' WHERE tipo_grafico IS NULL;

COMMIT;
