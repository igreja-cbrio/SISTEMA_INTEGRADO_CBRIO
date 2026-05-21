-- ============================================================================
-- KPIs "Novos convertidos atendidos" · move de Investir pra Seguir a Jesus
-- ============================================================================
-- Marcos (2026-05-21): "conversoes nao esta em investir tempo com Deus,
-- verifica isso".
--
-- Os 5 KPIs sao "% solicitacoes de novos convertidos atendidos" (AMI-21,
-- BRG-19, KIDS-19, ONL-04, SED-17). Hoje em valores=['investir'] mas:
--   - "Investir tempo com Deus" = devocionais, jornada180, pratica espiritual
--     do CRISTAO ATIVO
--   - Novo convertido atendido = trilha de discipulado · pertence a SEGUIR
--
-- Atendimento pastoral a novo convertido eh acompanhamento da decisao ·
-- esta no caminho de "Seguir a Jesus" (ele acabou de decidir e esta sendo
-- discipulado), nao em "Investir tempo".
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
   SET valores = ARRAY['seguir']::text[],
       updated_at = now()
 WHERE id IN ('AMI-21', 'BRG-19', 'KIDS-19', 'ONL-04', 'SED-17')
   AND valores = ARRAY['investir']::text[];

-- Conferencia:
--   SELECT id, area, indicador, valores
--     FROM kpi_indicadores_taticos
--    WHERE id IN ('AMI-21','BRG-19','KIDS-19','ONL-04','SED-17');
-- Esperado: 5 linhas com valores = {seguir}
-- ============================================================================
