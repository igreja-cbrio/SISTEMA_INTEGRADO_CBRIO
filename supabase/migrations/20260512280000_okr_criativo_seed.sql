-- ============================================================================
-- OKR Criativo · estrutura igual aos OKRs adm (Atender SLA + Qualidade)
--
-- Marcos: "crie outra matriz, exatamente igual a essa da gestão mas com
--          o nome Criativo × Area, com os mesmos indicadores por enquanto
--          usando as areas: Produção, Adoração e Marketing"
--
-- Setup:
-- - 1 OKR Geral · Atender solicitacoes do Criativo no SLA
-- - 1 OKR Geral · Qualidade do Criativo
-- - 3 KRs Gerais por OKR (volume/comparacao/threshold)
-- - 9 KR especificos por OKR (3 KRs × 3 areas criativas)
-- - 3 KPIs especificos por OKR (ADM-C-G-* / ADM-C-Q-*)
-- - SLA definicoes default p/ producao, adoracao, marketing (resposta + resolucao)
--
-- Requer migration 20260512270000 commitada (enum values).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SLA definicoes default para as 3 areas criativas
-- ----------------------------------------------------------------------------
INSERT INTO public.sla_definicoes (
  area_responsavel, subcategoria, eh_urgente,
  sla_resposta_horas, sla_resolucao_horas, descricao, ativo
)
SELECT * FROM (VALUES
  ('producao'::area_adm_resp,  'default', false,  24, 72,  'Padrao · resposta 1 dia, entrega 3 dias', true),
  ('producao'::area_adm_resp,  'default', true,    4, 24,  'Urgente · entrega 1 dia', true),
  ('adoracao'::area_adm_resp,  'default', false,  24, 72,  'Padrao · resposta 1 dia, entrega 3 dias', true),
  ('adoracao'::area_adm_resp,  'default', true,    4, 24,  'Urgente · entrega 1 dia', true),
  ('marketing'::area_adm_resp, 'default', false,  24, 96,  'Padrao · resposta 1 dia, entrega 4 dias', true),
  ('marketing'::area_adm_resp, 'default', true,    4, 24,  'Urgente · entrega 1 dia', true)
) AS t(area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao, ativo)
ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO UPDATE SET
  sla_resposta_horas = EXCLUDED.sla_resposta_horas,
  sla_resolucao_horas = EXCLUDED.sla_resolucao_horas,
  descricao = EXCLUDED.descricao,
  ativo = true,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. OKR Geral · Atender SLA do Criativo (c000)
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (
  id, direcionador_id, nome, indicador_geral, valores, ordem, ativo, tipo_okr,
  meta_descricao, meta_valor
)
VALUES (
  'a1adb000-0000-0000-0000-00000000c000'::uuid,
  '11111111-1111-1111-1111-111111111111',
  'Aumentar numero de solicitacoes atendidas do Criativo',
  '% solicitacoes do criativo concluidas no SLA · todas as areas',
  ARRAY[]::text[], 32, true, 'operacional',
  '>=85% em todas as areas criativas', 85
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
-- 3. KRs Gerais do OKR Atender SLA Criativo (3 KRs)
-- ----------------------------------------------------------------------------
WITH novos_krs AS (
  SELECT * FROM (VALUES
    ('a1adb000-0000-0000-0000-00000000c000'::uuid,
     'Atender >=85% das solicitacoes dentro do SLA no ano',
     'Media ponderada das 3 areas criativas · soma das atendidas no prazo / soma total',
     85, '>=85%', '%', 1),
    ('a1adb000-0000-0000-0000-00000000c000'::uuid,
     'Volume mensal de solicitacoes atendidas cresce vs mes anterior',
     'Mantem capacidade crescendo · garante que o criativo escala junto com a igreja',
     0, '>=12 meses positivos', 'meses', 2),
    ('a1adb000-0000-0000-0000-00000000c000'::uuid,
     '0 areas criativas com SLA abaixo de 70% no trimestre',
     'Floor de qualidade · nenhuma area abandonada', 0, '0 areas', 'areas', 3)
  ) AS t(objetivo_geral_id, titulo, descricao, meta_valor, meta_texto, unidade, ordem)
)
INSERT INTO public.kpi_krs (objetivo_geral_id, kpi_id, titulo, descricao, meta_valor, meta_texto, unidade, ordem, ativo)
SELECT n.objetivo_geral_id, NULL, n.titulo, n.descricao, n.meta_valor, n.meta_texto, n.unidade, n.ordem, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.objetivo_geral_id = n.objetivo_geral_id
      AND k.ordem = n.ordem
      AND k.kpi_id IS NULL
      AND k.area IS NULL
 );

-- ----------------------------------------------------------------------------
-- 4. KPIs especificos · 1 por area criativa
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  ('ADM-C-G-PRODUCAO',  '% atendidas no SLA · Produção',
   'Entregas de producao concluidas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000c000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"producao","metrica":"resolucao_no_sla","grupo":"producao"}'::jsonb),
  ('ADM-C-G-ADORACAO',  '% atendidas no SLA · Adoração',
   'Demandas de adoracao concluidas no prazo (musicas, arranjos, ensaios)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000c000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"adoracao","metrica":"resolucao_no_sla","grupo":"adoracao"}'::jsonb),
  ('ADM-C-G-MARKETING', '% atendidas no SLA · Marketing',
   'Entregas de marketing concluidas no prazo (campanhas, social, design)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000c000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"marketing","metrica":"resolucao_no_sla","grupo":"marketing"}'::jsonb)
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
-- 5. OKR Geral · Qualidade do Criativo (d000)
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (
  id, direcionador_id, nome, indicador_geral, valores, ordem, ativo, tipo_okr,
  meta_descricao, meta_valor
)
VALUES (
  'a1adb000-0000-0000-0000-00000000d000'::uuid,
  '11111111-1111-1111-1111-111111111111',
  'Elevar qualidade do Criativo percebida pelos ministerios',
  'NPS interno medio do criativo + saudavel uso da urgencia',
  ARRAY[]::text[], 33, true, 'operacional',
  'NPS >= 8 e urgencia <= 15%', 8
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
-- 6. KRs Gerais do OKR Qualidade Criativo (3 KRs)
-- ----------------------------------------------------------------------------
WITH novos_krs AS (
  SELECT * FROM (VALUES
    ('a1adb000-0000-0000-0000-00000000d000'::uuid,
     'NPS interno medio >= 8 em todas as areas criativas',
     'Media das 3 areas criativas · soma das notas / total respostas',
     8, '>=8/10', 'nota', 1),
    ('a1adb000-0000-0000-0000-00000000d000'::uuid,
     '<=15% das solicitacoes marcadas como urgentes',
     'Indicador de planejamento · urgencia alta = ministerios reagem em vez de planejar',
     15, '<=15%', '%', 2),
    ('a1adb000-0000-0000-0000-00000000d000'::uuid,
     '0 areas criativas com NPS abaixo de 7 no trimestre',
     'Floor de qualidade · nenhuma area com cliente insatisfeito',
     0, '0 areas', 'areas', 3)
  ) AS t(objetivo_geral_id, titulo, descricao, meta_valor, meta_texto, unidade, ordem)
)
INSERT INTO public.kpi_krs (objetivo_geral_id, kpi_id, titulo, descricao, meta_valor, meta_texto, unidade, ordem, ativo)
SELECT n.objetivo_geral_id, NULL, n.titulo, n.descricao, n.meta_valor, n.meta_texto, n.unidade, n.ordem, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.objetivo_geral_id = n.objetivo_geral_id
      AND k.ordem = n.ordem
      AND k.kpi_id IS NULL
      AND k.area IS NULL
 );

-- ----------------------------------------------------------------------------
-- 7. KPIs Qualidade · 1 por area criativa (NPS interno)
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  ('ADM-C-Q-PRODUCAO',  'NPS interno · Produção',
   'Avaliacao 0-10 dos ministerios sobre producao',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000d000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"producao","metrica":"nps_medio","grupo":"producao"}'::jsonb),
  ('ADM-C-Q-ADORACAO',  'NPS interno · Adoração',
   'Avaliacao 0-10 dos ministerios sobre adoracao',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000d000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"adoracao","metrica":"nps_medio","grupo":"adoracao"}'::jsonb),
  ('ADM-C-Q-MARKETING', 'NPS interno · Marketing',
   'Avaliacao 0-10 dos ministerios sobre marketing',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000d000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"marketing","metrica":"nps_medio","grupo":"marketing"}'::jsonb)
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
-- 8. KR especificos por area criativa
--    OKR Atender SLA (c000): 3 KRs Gerais × 3 areas = 9 KR especificos
--    OKR Qualidade (d000):   3 KRs Gerais × 3 areas = 9 KR especificos
-- ----------------------------------------------------------------------------
WITH areas_criativas AS (
  SELECT * FROM (VALUES
    ('producao',  'Produção',  1),
    ('adoracao',  'Adoração',  2),
    ('marketing', 'Marketing', 3)
  ) AS t(area_nome, label, ordem_area)
),
krs_geral_criativo AS (
  SELECT id, objetivo_geral_id, titulo, descricao,
         meta_valor, meta_texto, unidade, ordem
    FROM public.kpi_krs
   WHERE objetivo_geral_id IN (
           'a1adb000-0000-0000-0000-00000000c000'::uuid,
           'a1adb000-0000-0000-0000-00000000d000'::uuid
         )
     AND kr_pai_id IS NULL
     AND ativo = true
),
novos_krs AS (
  SELECT
    g.objetivo_geral_id,
    g.id  AS kr_pai_id,
    g.titulo,
    COALESCE(g.descricao, '') || ' · area: ' || a.label  AS descricao,
    g.meta_valor, g.meta_texto, g.unidade, g.ordem,
    a.area_nome AS area
  FROM krs_geral_criativo g CROSS JOIN areas_criativas a
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

-- Recalcula
DO $$
DECLARE v jsonb;
BEGIN
  v := public.recalcular_todos_kpis_adm();
  RAISE NOTICE 'KPIs criativo recalculados: %', v;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Recalcular adm falhou (ok pra novos KPIs sem dado): %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT id, nome FROM kpi_objetivos_gerais WHERE id IN
--   ('a1adb000-0000-0000-0000-00000000c000','a1adb000-0000-0000-0000-00000000d000');
-- Espera: 2 OKRs (Atender + Qualidade Criativo)
--
-- SELECT id FROM kpi_indicadores_taticos WHERE id LIKE 'ADM-C-%' AND ativo=true;
-- Espera: 6 (3 ADM-C-G-* + 3 ADM-C-Q-*)
--
-- SELECT count(*) FROM kpi_krs
--  WHERE objetivo_geral_id IN ('a1adb000-0000-0000-0000-00000000c000','a1adb000-0000-0000-0000-00000000d000')
--    AND kr_pai_id IS NOT NULL AND ativo = true;
-- Espera: 18 (9 por OKR)
-- ============================================================================
