-- ============================================================================
-- OKR NPS de Culto · reposicionado de Criativo/Producao → Ministerial/Seguir
--
-- Marcos: "nao acho que isso seja um okr do criativo, acho que tem que estar
--          relacionado a experiencia de culto, mude tudo, quero que essa
--          questao da NPS do culto seja vinculado em seguir a jesus na outra
--          matriz para todos os cultos e nao para producao, faca dessa forma,
--          faz mais sentido"
--
-- Mudancas:
-- 1. OKR e000:
--    - tipo_okr: operacional → qualitativo (ministerial)
--    - nome: "Elevar NPS dos cultos · Producao" → "Elevar NPS dos cultos"
--    - valores: [] → ['seguir']
--    - Aparece no filtro "Ministerial · Seguir a Jesus" e na Matriz Valor × Area
-- 2. KPIs CULTO-NPS-*:
--    - valores: ['investir'] → ['seguir']
--    - formula_config: remove area_responsavel='producao' e grupo='producao'
--    - mantem fonte='nps_cultos' e metrica='nps_culto'
-- ============================================================================

-- 1. Reposiciona OKR de operacional → ministerial qualitativo (Seguir)
UPDATE public.kpi_objetivos_gerais
   SET tipo_okr = 'qualitativo',
       nome = 'Elevar NPS dos cultos',
       valores = ARRAY['seguir']::text[],
       indicador_geral = 'NPS medio dos cultos por area · avaliacao da experiencia (0-10)',
       meta_descricao = 'NPS >= 9 em todas as 5 areas de culto',
       updated_at = now()
 WHERE id = 'a1adb000-0000-0000-0000-00000000e000'::uuid;

-- 2. KPIs: valor 'seguir' e formula_config sem 'producao'
UPDATE public.kpi_indicadores_taticos
   SET valores = ARRAY['seguir']::text[],
       formula_config = jsonb_build_object(
         'fonte',    'nps_cultos',
         'metrica',  'nps_culto',
         'contexto', 'culto'
       ),
       updated_at = now()
 WHERE id LIKE 'CULTO-NPS-%'
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT id, nome, tipo_okr, valores FROM kpi_objetivos_gerais
--  WHERE id = 'a1adb000-0000-0000-0000-00000000e000';
-- Espera: tipo='qualitativo', valores=['seguir']
--
-- SELECT id, area, valores, formula_config FROM kpi_indicadores_taticos
--  WHERE id LIKE 'CULTO-NPS-%' ORDER BY id;
-- Espera: 5 rows · valores=['seguir'], formula_config sem area_responsavel
-- ============================================================================
