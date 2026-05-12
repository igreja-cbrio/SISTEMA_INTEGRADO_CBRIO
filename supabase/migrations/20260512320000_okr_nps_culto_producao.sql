-- ============================================================================
-- OKR NPS de Culto · Producao (Criativo)
--
-- Marcos: "adicione a aba da producao um okr de nps de culto, para as pessoas
--          avaliarem os cultos, coloque esse como objetivo geral e deixe um
--          nps especifico por area"
--
-- Estrutura:
-- - 1 OKR Geral "Elevar NPS dos cultos" (id e000 · tipo_okr=operacional)
-- - 3 KRs Gerais (NPS medio, volume avaliacoes, floor por area)
-- - 5 KPIs especificos (1 por area de culto · kids/ami/bridge/sede/online)
-- - 15 KR especificos (3 KRs × 5 areas)
--
-- formula_config.area_responsavel='producao' indica que e responsabilidade
-- do time de Producao (Criativo) entregar cultos com alto NPS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OKR Geral · e000
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (
  id, direcionador_id, nome, indicador_geral, valores,
  ordem, ativo, tipo_okr, meta_descricao, meta_valor
)
VALUES (
  'a1adb000-0000-0000-0000-00000000e000'::uuid,
  '11111111-1111-1111-1111-111111111111',
  'Elevar NPS dos cultos · Producao',
  'NPS medio dos cultos por area · avaliacao 0-10 dos participantes',
  ARRAY[]::text[],
  34, true, 'operacional',
  '>=9 em todas as 5 areas de culto', 9
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  indicador_geral = EXCLUDED.indicador_geral,
  tipo_okr = EXCLUDED.tipo_okr,
  ordem = EXCLUDED.ordem,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  ativo = true;

-- ----------------------------------------------------------------------------
-- 2. KRs Gerais · 3
-- ----------------------------------------------------------------------------
WITH novos_krs AS (
  SELECT * FROM (VALUES
    (
      'a1adb000-0000-0000-0000-00000000e000'::uuid,
      'NPS medio dos cultos >=9 em todas as areas',
      'Media ponderada das 5 areas · soma das notas / total respostas',
      9, '>=9/10', 'nota', 1
    ),
    (
      'a1adb000-0000-0000-0000-00000000e000'::uuid,
      'Volume mensal de avaliacoes cresce vs mes anterior',
      'Mantem amostra estatistica relevante · evita NPS de poucos respondentes',
      0, '>=12 meses positivos', 'meses', 2
    ),
    (
      'a1adb000-0000-0000-0000-00000000e000'::uuid,
      '0 areas de culto com NPS abaixo de 7 no trimestre',
      'Floor de qualidade · nenhuma area com cliente insatisfeito',
      0, '0 areas', 'areas', 3
    )
  ) AS t(objetivo_geral_id, titulo, descricao, meta_valor, meta_texto, unidade, ordem)
)
INSERT INTO public.kpi_krs (
  objetivo_geral_id, kpi_id, titulo, descricao,
  meta_valor, meta_texto, unidade, ordem, ativo
)
SELECT n.objetivo_geral_id, NULL, n.titulo, n.descricao,
       n.meta_valor, n.meta_texto, n.unidade, n.ordem, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.objetivo_geral_id = n.objetivo_geral_id
      AND k.ordem = n.ordem
      AND k.kpi_id IS NULL
      AND k.area IS NULL
 );

-- ----------------------------------------------------------------------------
-- 3. KPIs especificos · 1 por area de culto
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  (
    'CULTO-NPS-KIDS',
    'NPS Culto · CBKids',
    'Avaliacao 0-10 dos participantes sobre o culto Kids',
    'kids',
    ARRAY[]::text[],
    'mensal',
    '>=9', 9, 'nota', true, true,
    'a1adb000-0000-0000-0000-00000000e000'::uuid,
    'operacional', 'razao',
    '{"fonte":"nps_cultos","area_responsavel":"producao","metrica":"nps_culto","grupo":"producao"}'::jsonb
  ),
  (
    'CULTO-NPS-AMI',
    'NPS Culto · AMI',
    'Avaliacao 0-10 dos participantes sobre o culto AMI',
    'ami',
    ARRAY[]::text[],
    'mensal',
    '>=9', 9, 'nota', true, true,
    'a1adb000-0000-0000-0000-00000000e000'::uuid,
    'operacional', 'razao',
    '{"fonte":"nps_cultos","area_responsavel":"producao","metrica":"nps_culto","grupo":"producao"}'::jsonb
  ),
  (
    'CULTO-NPS-BRIDGE',
    'NPS Culto · Bridge',
    'Avaliacao 0-10 dos participantes sobre o culto Bridge',
    'bridge',
    ARRAY[]::text[],
    'mensal',
    '>=9', 9, 'nota', true, true,
    'a1adb000-0000-0000-0000-00000000e000'::uuid,
    'operacional', 'razao',
    '{"fonte":"nps_cultos","area_responsavel":"producao","metrica":"nps_culto","grupo":"producao"}'::jsonb
  ),
  (
    'CULTO-NPS-SEDE',
    'NPS Culto · Sede',
    'Avaliacao 0-10 dos participantes sobre o culto Sede',
    'sede',
    ARRAY[]::text[],
    'mensal',
    '>=9', 9, 'nota', true, true,
    'a1adb000-0000-0000-0000-00000000e000'::uuid,
    'operacional', 'razao',
    '{"fonte":"nps_cultos","area_responsavel":"producao","metrica":"nps_culto","grupo":"producao"}'::jsonb
  ),
  (
    'CULTO-NPS-ONLINE',
    'NPS Culto · Online',
    'Avaliacao 0-10 dos participantes sobre o culto Online',
    'online',
    ARRAY[]::text[],
    'mensal',
    '>=9', 9, 'nota', true, true,
    'a1adb000-0000-0000-0000-00000000e000'::uuid,
    'operacional', 'razao',
    '{"fonte":"nps_cultos","area_responsavel":"producao","metrica":"nps_culto","grupo":"producao"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  indicador = EXCLUDED.indicador,
  descricao = EXCLUDED.descricao,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  formula_config = EXCLUDED.formula_config,
  objetivo_geral_id = EXCLUDED.objetivo_geral_id,
  tipo_kpi = EXCLUDED.tipo_kpi,
  ativo = true,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 4. KR especificos · 15 (3 KRs Gerais × 5 areas de culto)
-- ----------------------------------------------------------------------------
WITH areas_culto AS (
  SELECT * FROM (VALUES
    ('kids',   'CBKids', 1),
    ('ami',    'AMI',    2),
    ('bridge', 'Bridge', 3),
    ('sede',   'Sede',   4),
    ('online', 'Online', 5)
  ) AS t(area_nome, label, ordem_area)
),
krs_geral_culto AS (
  SELECT id, objetivo_geral_id, titulo, descricao,
         meta_valor, meta_texto, unidade, ordem
    FROM public.kpi_krs
   WHERE objetivo_geral_id = 'a1adb000-0000-0000-0000-00000000e000'::uuid
     AND kr_pai_id IS NULL
     AND ativo = true
),
novos_krs AS (
  SELECT
    g.objetivo_geral_id,
    g.id AS kr_pai_id,
    g.titulo,
    COALESCE(g.descricao, '') || ' · area: ' || a.label AS descricao,
    g.meta_valor, g.meta_texto, g.unidade, g.ordem,
    a.area_nome AS area
  FROM krs_geral_culto g
  CROSS JOIN areas_culto a
)
INSERT INTO public.kpi_krs (
  objetivo_geral_id, kr_pai_id, kpi_id, titulo, descricao,
  meta_valor, meta_texto, unidade, ordem, area, ativo
)
SELECT n.objetivo_geral_id, n.kr_pai_id, NULL, n.titulo, n.descricao,
       n.meta_valor, n.meta_texto, n.unidade, n.ordem, n.area, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.kr_pai_id = n.kr_pai_id
      AND k.area      = n.area
      AND k.ativo     = true
 );

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT id, nome FROM kpi_objetivos_gerais WHERE id = 'a1adb000-0000-0000-0000-00000000e000';
-- Espera: 1 row · "Elevar NPS dos cultos · Producao"
--
-- SELECT id FROM kpi_indicadores_taticos WHERE id LIKE 'CULTO-NPS-%' AND ativo=true;
-- Espera: 5 KPIs
--
-- SELECT count(*) FROM kpi_krs
--  WHERE objetivo_geral_id = 'a1adb000-0000-0000-0000-00000000e000'
--    AND kr_pai_id IS NOT NULL AND ativo = true;
-- Espera: 15 (3 KRs × 5 areas)
-- ============================================================================
