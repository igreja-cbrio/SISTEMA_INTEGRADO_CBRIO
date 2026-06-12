-- ============================================================================
-- Frente B · remove (soft) os KRs que nenhum KPI consegue responder (2026-06-03)
-- ============================================================================
-- Marcos: "o KR é respondido pelo KPI central · sem entrada manual · o que
-- precisar de mais coisa pra preencher, remove". Aprovou remover os 4 padrões
-- não-mensuráveis-por-KPI. Soft-delete (ativo=false) · REVERSÍVEL.
--
-- Removidos (precisam varrer período/entidade, não são um valor de KPI):
--   1. Floor "0 X" (0 áreas/cultos/trimestres/lideres/grupos/meses/solicitacoes/
--      semanas/ciclos com falha) · contagem de falhas
--   2. Contagem de meses ("Maior frequencia mes x mes em >=12 meses",
--      ">=10 meses com arrecadacao maior", ">=8 meses do ano com crescimento",
--      ">=80% das semanas com crescimento positivo")
--   3. Processo/cadência ("100% dos cultos com lista repassada", "Volume mensal
--      ... cresce vs mes anterior", ">=1 turma de treinamento ativa por trimestre")
--   4. Vago ("Make a Difference: definir base e crescer" · sem meta)
--
-- MANTIDOS: os "número vs meta" (NPS>=70, >=80% comparecem, Total>=750,
--   cresce >=X% vs 2025, >=30% em <=90d, 100% das solicitacoes atendidas, etc).
--
-- Esperado: 201 KRs desativados (34 gerais + 167 específicos). Sobram ~316.
-- Pra reverter: UPDATE ... SET ativo=true com os mesmos filtros.
-- ============================================================================

UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE ativo = true
   AND (
     titulo ILIKE '0 %'
     OR titulo ILIKE '%meses com arrecadacao maior%'
     OR titulo ILIKE '%meses do ano com crescimento%'
     OR titulo ILIKE 'Maior frequencia mes x mes%'
     OR titulo ILIKE '%das semanas com crescimento positivo%'
     OR titulo ILIKE '%dos cultos com lista repassada%'
     OR titulo ILIKE 'Volume mensal%cresce vs mes anterior%'
     OR titulo ILIKE '%turma de treinamento ativa por trimestre%'
     OR titulo ILIKE 'Make a Difference%'
   );

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT count(*) FROM kpi_krs WHERE ativo = true;          -- esperado ~316
--   SELECT count(*) FROM kpi_krs WHERE ativo = false;         -- subiu ~201
-- ============================================================================
