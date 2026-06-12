-- ============================================================================
-- Remove CBA dos OKRs ministeriais
--
-- Marcos: "retirar o CBA de todos os objetivos gerais, inclusive desse
--          painel, o unico dado que vamos pegar das igrejas CBA e numero
--          de batismos e numero de aceitacoes, mas faca de algum jeito
--          que eles nao aparecam na matriz pra nao ficar feio"
--
-- Decisao:
-- - Desativa TODOS os KR especificos com area='cba' (75 KRs)
-- - Desativa CBA-* KPIs EXCETO CBA-01 (batismos) e CBA-02 (aceitacoes)
--   · esses 2 ficam ativos mas serao filtrados da matriz no backend
-- - Backend /matriz remove 'cba' da lista de areas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Desativa todos os KR especificos com area='cba' (75 KRs em 25 OKRs)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE area = 'cba'
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- 2. Desativa CBA-* EXCETO os 2 que continuam coletando dados
--    CBA-01 = % crescimento de batismos
--    CBA-02 = % crescimento de conversões (aceitacoes)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE area = 'cba'
   AND id NOT IN ('CBA-01', 'CBA-02')
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT count(*) FROM kpi_krs WHERE area = 'cba' AND ativo = true;
-- Espera: 0
--
-- SELECT id, indicador, ativo FROM kpi_indicadores_taticos
--  WHERE area = 'cba' ORDER BY id;
-- Espera: CBA-01 e CBA-02 com ativo=true, demais false
-- ============================================================================
