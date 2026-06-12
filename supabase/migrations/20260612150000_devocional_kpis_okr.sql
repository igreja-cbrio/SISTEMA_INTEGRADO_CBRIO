-- ============================================================================
-- Devocionais · KPIs medidos pelo app + ligação OKR (2026-06-12)
-- ============================================================================
-- O devocional está NO AR via app (check-in diário grava mem_devocionais).
-- O objetivo OKR "Aumentar Pessoas fazendo Devocionais" (576c04ec · Investir)
-- existia com KRs SEM medição ("Auto via mem_devocionais quando modulo for
-- criado" — o módulo agora existe). Esta migration liga os fios:
--
--   1. KPIs táticos novos DEV-01/02/03 medidos do mem_devocionais via
--      coletores JS (kpiAutoCollector · fonte_auto 'devocionais.*' ·
--      tipo_calculo='manual' → a view lê de kpi_registros).
--   2. KR de volume ("Crescimento >=50% no nº de devocionais/mes") ganha
--      fonte_kpi_id=DEV-01 → /gestao passa a mostrar o realizado (B1).
--
-- Decisões/limitações (números honestos):
--   - Devocional NÃO tem dimensão de área de culto (mem_devocionais não tem
--     área; mesma limitação documentada dos ramos grupos/devocionais/jornada).
--     Os KPIs entram como área 'sede' = igreja toda. Os KRs filhos por área
--     ficam SEM fonte (não dá pra medir por área honestamente).
--   - meta_valor = NULL nos volumes (app novo · sem baseline 2025; a view
--     trata como 'sem_meta', sem vermelho falso). Marcos define a meta em
--     /gestao quando houver histórico.
--   - KR de famílias (">=25% das familias do CBKids") segue sem fonte: o
--     check-in do app é tipo='pessoal'; devocional familiar ainda não tem
--     captura no app (DEV-03 conta o que existir de tipo='familiar').

-- ----------------------------------------------------------------------------
-- 1. KPIs táticos · igreja toda (área sede) · valor Investir
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos
  (id, area, indicador, descricao, periodicidade, meta_valor, meta_descricao,
   valores, is_okr, objetivo_geral_id, tipo_calculo, tipo_kpi, fonte_auto,
   ano, ativo, sort_order, periodo_offset_meses, formula_config)
VALUES
  ('DEV-01','sede','Devocionais registrados no mês (app)',
   'Check-ins de devocional registrados no app no mês (mem_devocionais · igreja toda). Coletor devocionais.checkins.',
   'mensal',NULL,'Crescimento — meta a definir quando houver baseline',
   ARRAY['investir']::text[],true,'576c04ec-88a2-40f3-6ba2-9d03fe65de96','manual','quantitativo','devocionais.checkins',
   2026,true,0,0,'{}'::jsonb),
  ('DEV-02','sede','Pessoas fazendo devocional no mês (app)',
   'Membros distintos com ao menos 1 check-in de devocional no mês (igreja toda). Coletor devocionais.pessoas.',
   'mensal',NULL,'Crescimento — meta a definir quando houver baseline',
   ARRAY['investir']::text[],true,'576c04ec-88a2-40f3-6ba2-9d03fe65de96','manual','quantitativo','devocionais.pessoas',
   2026,true,1,0,'{}'::jsonb),
  ('DEV-03','sede','Famílias com devocional familiar no mês',
   'Famílias distintas com ao menos 1 devocional tipo=familiar no mês. Coletor devocionais.familias (já existia · KID-04 ficou dormente).',
   'mensal',NULL,'>=25% das famílias — medível quando o app capturar devocional familiar',
   ARRAY['investir']::text[],true,'576c04ec-88a2-40f3-6ba2-9d03fe65de96','manual','quantitativo','devocionais.familias',
   2026,true,2,0,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. OKR · KR geral de volume passa a ser medido pelo DEV-01
--    (kr abd34ae6 = "Crescimento >=50% no nº de devocionais/mes vs 2025")
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET fonte_kpi_id = 'DEV-01', updated_at = now()
 WHERE id = 'abd34ae6-aad5-47bd-aa95-734623c1dc7d'
   AND fonte_kpi_id IS NULL;

COMMENT ON COLUMN public.kpi_indicadores_taticos.fonte_auto IS
  'Coletor JS (kpiAutoCollector) que popula kpi_registros. Prefixos: cultos., cuidados., devocionais., next., cba., grupos., vol., etc.';
