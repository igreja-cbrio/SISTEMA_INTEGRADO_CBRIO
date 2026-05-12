-- ============================================================================
-- KPIs CULTO-NPS-* recebem valor 'investir' (Investir Tempo com Deus)
--
-- Marcos: "no painel, nao aumentou na celula dos cultos CBKids, Ami, Online,
--          Bridge e Sede a questao dos nps de culto, e um objetivo
--          especifico de cada culto"
--
-- Bug: KPIs CULTO-NPS-* foram criados com valores=ARRAY[]::text[]. Sem valor
-- atribuido, o filtro da matriz Valor × Area (k.valores.includes(v)) nunca
-- retornava true · resultado: KPIs invisiveis na matriz.
--
-- Fix: atribui valor 'investir' aos 5 KPIs.
-- Justificativa: NPS de culto mede qualidade da experiencia de adoracao ·
-- "Investir Tempo com Deus" e o valor mais aderente ao proposito do culto.
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
   SET valores = ARRAY['investir']::text[],
       updated_at = now()
 WHERE id LIKE 'CULTO-NPS-%'
   AND ativo = true;

-- Bust cache de mandalas e matriz no backend (manual via endpoint apos deploy)
-- POST /api/painel/cache/bust  body: { "prefix": "" }

-- Conferencia:
-- SELECT id, area, valores FROM kpi_indicadores_taticos
--  WHERE id LIKE 'CULTO-NPS-%' ORDER BY id;
-- Espera: 5 rows · valores = ['investir']
-- ============================================================================
