-- ============================================================================
-- Remove Criativo dos OKRs adm
--
-- Marcos: "retire o Criativo, inclusive de todos os okrs, vamos criar uma
--          matriz específica pro criativo"
--
-- Justificativa: Criativo tem natureza diferente (entrega criativa, brand,
-- producao audiovisual) e precisa de KPIs proprios (deadline de campanha,
-- aprovacao, qualidade visual etc) que nao casam com o modelo SLA das demais.
-- Vai virar OKR + matriz separada depois.
--
-- Esta migration apenas desativa (nao deleta) pra preservar historico.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Desativa KPIs ADM-*-CRIATIVO (Atender SLA + Qualidade)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id IN ('ADM-G-CRIATIVO', 'ADM-Q-CRIATIVO');

-- ----------------------------------------------------------------------------
-- 2. Desativa 6 KR especificos de area = 'criativo'
--    (3 KRs Gerais × 2 OKRs adm)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE objetivo_geral_id IN (
         'a1adb000-0000-0000-0000-00000000a000'::uuid,
         'a1adb000-0000-0000-0000-00000000b000'::uuid
       )
   AND area = 'criativo'
   AND kr_pai_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
--   SELECT id, ativo FROM kpi_indicadores_taticos WHERE id LIKE '%CRIATIVO';
--   Espera: ativo=false
--
--   SELECT objetivo_geral_id, count(*)
--     FROM kpi_krs
--    WHERE objetivo_geral_id IN ('a1adb000-0000-0000-0000-00000000a000',
--                                'a1adb000-0000-0000-0000-00000000b000')
--      AND kr_pai_id IS NOT NULL AND ativo = true
--    GROUP BY objetivo_geral_id;
--   Espera: 24 cada (3 KRs Gerais × 8 areas, criativo removido)
-- ============================================================================
