-- ============================================================================
-- OKR Qualidade da Gestao · 2o OKR Geral operacional
--
-- Marcos: "cria um okr de qualidade da gestao"
--
-- Logica: enquanto o OKR "Atender no SLA" mede VOLUME/PRAZO, este mede
-- QUALIDADE PERCEBIDA · NPS interno (cliente avalia) + saudavel uso da
-- urgencia (planejamento ruim = muitas urgencias).
--
-- Estrutura igual ao OKR de atendimento:
-- 1 OKR Geral + 3 KRs Gerais + 9 KPIs especificos (1 por area adm).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OKR Geral · Qualidade da Gestao
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (
  id, direcionador_id, nome, indicador_geral, valores, ordem, ativo, tipo_okr,
  meta_descricao, meta_valor
)
VALUES (
  'a1adb000-0000-0000-0000-00000000b000'::uuid,
  '11111111-1111-1111-1111-111111111111',
  'Elevar qualidade da gestao percebida pelos ministerios',
  'NPS interno medio + saudavel uso de urgencia',
  ARRAY[]::text[], 31, true, 'operacional',
  'NPS >= 8 e urgencia <= 15%', 8
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  indicador_geral = EXCLUDED.indicador_geral,
  tipo_okr = EXCLUDED.tipo_okr,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  ativo = true;

-- ----------------------------------------------------------------------------
-- 2. KRs Gerais (3)
-- ----------------------------------------------------------------------------
WITH novos_krs AS (
  SELECT * FROM (VALUES
    ('a1adb000-0000-0000-0000-00000000b000'::uuid,
     'NPS interno medio >= 8 em todas as areas adm',
     'Media das 9 areas adm · soma das notas / total respostas',
     8, '>=8/10', 'nota', 1),
    ('a1adb000-0000-0000-0000-00000000b000'::uuid,
     '<=15% das solicitacoes marcadas como urgentes',
     'Indicador de planejamento · urgencia alta = ministerios reagem em vez de planejar',
     15, '<=15%', '%', 2),
    ('a1adb000-0000-0000-0000-00000000b000'::uuid,
     '0 areas adm com NPS abaixo de 7 no trimestre',
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
-- 3. KPIs Especificos · NPS por area adm
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  ('ADM-Q-RESERVA',   'NPS interno · Reserva de Espaço',
   'Avaliacao 0-10 dos ministerios sobre o servico de reserva',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"reserva_espaco","metrica":"nps_medio","grupo":"hospitalidade"}'::jsonb),
  ('ADM-Q-COZINHA',   'NPS interno · Cozinha',
   'Avaliacao 0-10 dos ministerios sobre o servico de cozinha',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"cozinha","metrica":"nps_medio","grupo":"hospitalidade"}'::jsonb),
  ('ADM-Q-MANUTENCAO','NPS interno · Manutenção',
   'Avaliacao 0-10 dos ministerios sobre manutencao',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"manutencao","metrica":"nps_medio","grupo":"hospitalidade"}'::jsonb),
  ('ADM-Q-LOG-EST',   'NPS interno · Logística Estoque',
   'Avaliacao 0-10 dos ministerios sobre estoque',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_estoque","metrica":"nps_medio","grupo":"logistica"}'::jsonb),
  ('ADM-Q-LOG-COM',   'NPS interno · Logística Compras',
   'Avaliacao 0-10 dos ministerios sobre compras',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_compras","metrica":"nps_medio","grupo":"logistica"}'::jsonb),
  ('ADM-Q-TI',        'NPS interno · TI',
   'Avaliacao 0-10 dos ministerios sobre TI',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"ti","metrica":"nps_medio","grupo":"ti"}'::jsonb),
  ('ADM-Q-RH',        'NPS interno · RH',
   'Avaliacao 0-10 dos ministerios sobre RH',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"rh","metrica":"nps_medio","grupo":"rh"}'::jsonb),
  ('ADM-Q-FIN',       'NPS interno · Financeiro',
   'Avaliacao 0-10 dos ministerios sobre financeiro',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"financeiro","metrica":"nps_medio","grupo":"financeiro"}'::jsonb),
  ('ADM-Q-CRIATIVO',  'NPS interno · Criativo',
   'Avaliacao 0-10 dos ministerios sobre criativo',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', true, true,
   'a1adb000-0000-0000-0000-00000000b000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"criativo","metrica":"nps_medio","grupo":"criativo"}'::jsonb)

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

-- Recalcula
DO $$
DECLARE v jsonb;
BEGIN
  v := public.recalcular_todos_kpis_adm();
  RAISE NOTICE 'KPIs adm recalculados: %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT id, nome, tipo_okr, ativo FROM kpi_objetivos_gerais
--  WHERE tipo_okr='operacional' AND ativo = true ORDER BY ordem;
-- Espera: 2 ativos (Atender SLA + Qualidade)
--
-- SELECT count(*) FROM kpi_indicadores_taticos
--  WHERE id LIKE 'ADM-Q-%' AND ativo = true;
-- Espera: 9
-- ============================================================================
