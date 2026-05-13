-- ============================================================================
-- Remove TODOS os KPIs do Kids em Grupos (limpeza completa)
--
-- Marcos: "voce ainda nao retirou os de conectar-se com pessoas no cbkids
--          como fizemos na estrutura okr"
--
-- Migration anterior (20260512310000) desativou KIDS-09 e KIDS-10, mas ainda
-- restaram 3 KPIs ativos do Kids no valor 'conectar' que dependem de dados
-- de grupos:
--   KIDS-07 · frequencia de grupos (% crescimento)
--   KIDS-08 · lideres em treinamento
--   KIDS-11 · NPS lideres (de grupos)
--
-- Kids nao tem mais grupos · todos esses 3 desativam.
-- Total: 3 KPIs + 9 KR especificos (3 KRs Gerais × 3 areas do Kids no
-- conectar = 9 KR especificos area='kids' nos OKRs de grupos relacionados)
-- ============================================================================

-- 1. Desativa KPIs
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id IN ('KIDS-07', 'KIDS-08', 'KIDS-11')
   AND ativo = true;

-- 2. Desativa qualquer KR especifico ainda ativo com area='kids' em OKRs
--    que tem 'grupo' no nome (esses 3 KPIs ja desativados acima nao tem
--    KRs · mas garantia · cobre OKRs de grupos que ainda tenham filhos Kids)
UPDATE public.kpi_krs k
   SET ativo = false, updated_at = now()
 WHERE k.area = 'kids'
   AND k.kr_pai_id IS NOT NULL
   AND k.ativo = true
   AND EXISTS (
     SELECT 1 FROM public.kpi_objetivos_gerais o
      WHERE o.id = k.objetivo_geral_id
        AND (lower(o.nome) LIKE '%grupo%' OR lower(o.nome) LIKE '%lider%')
   );

-- Conferencia:
-- SELECT id, ativo FROM kpi_indicadores_taticos WHERE id IN ('KIDS-07','KIDS-08','KIDS-11');
-- Espera: todos ativo=false
--
-- SELECT count(*) FROM kpi_krs k
--   JOIN kpi_objetivos_gerais o ON o.id = k.objetivo_geral_id
--  WHERE k.area = 'kids' AND k.kr_pai_id IS NOT NULL AND k.ativo = true
--    AND (lower(o.nome) LIKE '%grupo%' OR lower(o.nome) LIKE '%lider%');
-- Espera: 0
-- ============================================================================
