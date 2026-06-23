-- ============================================================================
-- KIDS-02 / KIDS-03 · liga a fonte_auto que faltava (KPIs ficavam "sem dado")
-- ============================================================================
-- Diagnóstico (2026-06-23): a frequência do Kids alimenta KIDS-01
-- (fonte cultos.kids_freq), mas KIDS-02 (conversões) e KIDS-03 (batismos)
-- estavam com fonte_auto NULL → nunca coletados (0 registros).
--   - KIDS-02 → coletor novo cultos.kids_conv (soma cultos.decisoes_kids).
--   - KIDS-03 → coletor batismos.kids (já existia, filtra area_kpi='kids').
-- Idempotente · só preenche quando ainda está NULL (não sobrescreve ajuste manual).

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.kids_conv', updated_at = now()
 WHERE id = 'KIDS-02' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'batismos.kids', updated_at = now()
 WHERE id = 'KIDS-03' AND fonte_auto IS NULL;
