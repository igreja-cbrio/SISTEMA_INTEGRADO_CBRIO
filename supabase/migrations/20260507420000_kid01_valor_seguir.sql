-- ============================================================================
-- FIX · KID-01 (Frequencia criancas) sem valor da jornada
--
-- O KPI "Frequencia criancas" foi criado em 2026-04-28 mas nunca recebeu o
-- array de valores da jornada. Aparece como "Sem valor" na tela.
--
-- Marcos: e Seguir Jesus (frequencia presencial conta como seguir).
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
   SET valores = ARRAY['seguir']::text[],
       updated_at = now()
 WHERE id = 'KID-01'
   AND (valores IS NULL OR array_length(valores, 1) IS NULL OR NOT 'seguir' = ANY(valores));

-- Conferencia (descomenta no Studio)
-- SELECT id, indicador, area, valores FROM kpi_indicadores_taticos WHERE id = 'KID-01';
