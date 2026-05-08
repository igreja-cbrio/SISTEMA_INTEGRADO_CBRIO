-- ============================================================================
-- CLEANUP · desativa KPIs legacy KID-01..KID-05
--
-- Em 28/04 foram seedados KID-01..KID-05 (estrutura antiga: direcionador_id,
-- sem objetivo_geral_id, sem valores). Em 07/05 a planilha v2 trouxe
-- KIDS-01..KIDS-13 (estrutura nova: objetivo_geral_id, valores) com a
-- mesma cobertura. Os KID-XX (3 letras, sem S) ficaram orfaos:
--
--   KID-01 "Frequencia criancas"        -> coberto por KIDS-01 (% crescimento)
--   KID-02 "Aceitacoes + Batismos"      -> coberto por KIDS-02 + KIDS-03
--   KID-03 "Batismos criancas (7+)"     -> ja estava ativo=false desde 28/04
--   KID-04 "Familias fazendo devocionais" -> coberto por KIDS-04
--   KID-05 "Saida de voluntarios"       -> coberto por KIDS-05
--
-- Marcos viu KID-01 e KID-05 aparecendo no /gestao aba Saude lista
-- "sem objetivo geral vinculado" e disse: sao apenas dados, nao KPIs
-- estrategicos. Soft-delete preservando historico (sem DELETE).
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       updated_at = now()
 WHERE id IN ('KID-01', 'KID-02', 'KID-04', 'KID-05')
   AND ativo = true;

-- Conferencia (descomenta no Studio):
-- SELECT id, indicador, area, ativo, objetivo_geral_id, valores
--   FROM kpi_indicadores_taticos
--  WHERE id LIKE 'KID-%' OR id LIKE 'KIDS-%'
--  ORDER BY id;
