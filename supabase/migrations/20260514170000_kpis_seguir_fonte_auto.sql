-- ============================================================================
-- Cascata "Seguir a Jesus" · liga KPIs Sede/Bridge/Online/Kids aos coletores
-- de cultos · tira "sem dado" da mandala/matriz Seguir.
--
-- Marcos: "quero que a matriz de seguir a jesus tire o 'sem dados' e vincule
--          com o que ja temos, quero que os dados de seguir a Jesus ja estejam
--          preenchidos nas mandalas do painel nsm"
--
-- Estado antes:
--   So AMI-01, AMI-02, CBA-01 tinham fonte_auto. Os outros 29 KPIs com
--   valores={seguir} ficavam sem dado mesmo com 88 cultos preenchidos em 2026.
--
-- Estado depois:
--   +7 KPIs ligados a coletores existentes/novos (cultos.sede_*, bridge_*,
--   online_*, kids_freq). Cron diario + setImmediate pos PUT/culto preenche.
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.bridge_freq', updated_at = now()
 WHERE id = 'BRG-01' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.bridge_conv', updated_at = now()
 WHERE id = 'BRG-02' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.sede_freq', updated_at = now()
 WHERE id = 'SED-21' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.sede_conv', updated_at = now()
 WHERE id = 'SED-18' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.online_freq', updated_at = now()
 WHERE id = 'ONL-11' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.online_conv', updated_at = now()
 WHERE id = 'ONL-13' AND fonte_auto IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.kids_freq', updated_at = now()
 WHERE id = 'KIDS-01' AND fonte_auto IS NULL;

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT id, area, indicador, fonte_auto FROM kpi_indicadores_taticos
--    WHERE id IN ('BRG-01','BRG-02','SED-21','SED-18','ONL-11','ONL-13','KIDS-01');
--   Espera: todos com fonte_auto definido
--
-- Apos rodar a migration, dispare o coletor pra preencher os registros:
--   POST /api/kpis/v2/coletar  body: { fontes: ['cultos.'] }
-- ============================================================================
