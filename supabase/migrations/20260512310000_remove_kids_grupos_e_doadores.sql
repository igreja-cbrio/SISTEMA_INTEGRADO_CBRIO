-- ============================================================================
-- Remove indicadores Kids em Grupos + OKR Melhorar Qualidade de Doadores
--
-- Marcos (apos conversa com lider ministerial):
-- 1. "remova os indicadores do kids de grupos, pode deixar na matriz mas
--    sem os objetivos especificos"
--    → KIDS-09 (lideres de grupos acompanhados) e KIDS-10 (numero de grupos)
--      sao 2 KPIs vinculados a OKRs de grupos · Kids agora nao tera mais
--      esses 2 OKRs especificos
--
-- 2. "retirar a questao de melhorar categoria de C pra B dos dizimistas,
--    retire o objetivo geral e os objetivos especificos que estao nas areas"
--    → OKR "Melhorar Qualidade de doadores" (8853cdc2-...) inteiro
--      + os 4 KPIs vinculados (AMI-12, BRG-11, SED-07, ONL-21)
--      + os 18 KR especificos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kids fora dos OKRs de Grupos
-- ----------------------------------------------------------------------------

-- 1a. Desativa KPIs especificos KIDS-09 e KIDS-10
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id IN ('KIDS-09', 'KIDS-10')
   AND ativo = true;

-- 1b. Desativa KR especificos com area='kids' nos 2 OKRs de grupos
--     (3 KRs Gerais × 1 area kids × 2 OKRs = 6 KR especificos)
UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE objetivo_geral_id IN (
         'e6f20018-78ac-1c2d-ad06-27178a7b8d53'::uuid,  -- Aumentar numero de grupos
         '72f8d900-60df-4a3b-c9f2-4dd0f990482f'::uuid   -- Aumentar numero de lideres de grupos acompanhados
       )
   AND area = 'kids'
   AND kr_pai_id IS NOT NULL
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- 2. OKR "Melhorar Qualidade de doadores" inteiro · grupo C → B
-- ----------------------------------------------------------------------------

-- 2a. Desativa OKR Geral
UPDATE public.kpi_objetivos_gerais
   SET ativo = false, updated_at = now()
 WHERE id = '8853cdc2-188f-6a5a-f678-c292ec57af86'::uuid;

-- 2b. Desativa os 4 KPIs vinculados (Grupo C avancando para B)
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id IN ('AMI-12', 'BRG-11', 'SED-07', 'ONL-21')
   AND ativo = true;

-- 2c. Desativa TODOS KRs (gerais + especificos) do OKR doadores
UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE objetivo_geral_id = '8853cdc2-188f-6a5a-f678-c292ec57af86'::uuid
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT id, ativo FROM kpi_indicadores_taticos
--  WHERE id IN ('KIDS-09','KIDS-10','AMI-12','BRG-11','SED-07','ONL-21');
-- Espera: todos com ativo=false
--
-- SELECT ativo FROM kpi_objetivos_gerais
--  WHERE id = '8853cdc2-188f-6a5a-f678-c292ec57af86';
-- Espera: false
--
-- SELECT count(*) FROM kpi_krs
--  WHERE objetivo_geral_id = '8853cdc2-188f-6a5a-f678-c292ec57af86'
--    AND ativo = true;
-- Espera: 0
-- ============================================================================
