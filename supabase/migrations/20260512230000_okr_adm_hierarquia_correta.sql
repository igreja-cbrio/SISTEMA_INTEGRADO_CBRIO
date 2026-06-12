-- ============================================================================
-- OKR ADM · HIERARQUIA CORRETA (1 geral + 9 KPIs especificos)
--
-- Marcos: "Cozinha · servir bem aos eventos e um OKR especifico. Coloca uma
-- camada acima como 'Aumentar numero de solicitacoes atendidas da gestao'
-- e destrincha pra todas as areas, igual aos ministeriais".
--
-- Estado atual (errado): 9 OKRs GERAIS operacionais (1 por area adm)
-- Estado correto: 1 OKR GERAL + 9 KPIs especificos (1 por area adm)
--
-- Esta migration:
-- 1. Cria 1 OKR Geral novo "Aumentar atendimento da gestao aos ministerios"
-- 2. Cria 3 KRs gerais (volume, comparacao historica, threshold)
-- 3. Desativa os 9 OKRs operacionais antigos (a1adb000-*)
-- 4. Desativa os 27 KPIs taticos antigos (ADM-*)
-- 5. Cria 9 KPIs taticos novos sob o OKR Geral, 1 por area adm
--    (com formula_config apontando pra area_responsavel)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NOVO OKR GERAL · "Aumentar atendimento da gestao"
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (
  id, direcionador_id, nome, indicador_geral, valores, ordem, ativo, tipo_okr,
  meta_descricao, meta_valor
)
VALUES (
  'a1adb000-0000-0000-0000-00000000a000'::uuid,
  '11111111-1111-1111-1111-111111111111',
  'Aumentar numero de solicitacoes atendidas da gestao',
  '% solicitacoes da gestao concluidas no SLA · todas as areas',
  ARRAY[]::text[], 30, true, 'operacional',
  '>=85% em todas as areas adm', 85
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
-- 2. KRs GERAIS · padrao validado (volume, comparacao, threshold)
-- ----------------------------------------------------------------------------
WITH novos_krs AS (
  SELECT * FROM (VALUES
    ('a1adb000-0000-0000-0000-00000000a000'::uuid, 'Atender >=85% das solicitacoes dentro do SLA no ano',
     'Media ponderada das 9 areas adm · soma das atendidas no prazo / soma total', 85, '>=85%', '%', 1),
    ('a1adb000-0000-0000-0000-00000000a000'::uuid, 'Volume mensal de solicitacoes atendidas cresce vs mes anterior',
     'Mantem capacidade crescendo · garante que a gestao escala junto com a igreja', 0,
     '>=12 meses positivos', 'meses', 2),
    ('a1adb000-0000-0000-0000-00000000a000'::uuid, '0 areas adm com SLA abaixo de 70% no trimestre',
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
-- 3. DESATIVA OKRs gerais operacionais antigos (a1adb000-0001 ate -0009)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_objetivos_gerais
   SET ativo = false, updated_at = now()
 WHERE id::text LIKE 'a1adb000-000_-000_-000_-00000000a00_'
   AND id != 'a1adb000-0000-0000-0000-00000000a000'::uuid;

-- ----------------------------------------------------------------------------
-- 4. DESATIVA KPIs taticos antigos ADM-* (que apontavam pros 9 OKRs antigos)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id LIKE 'ADM-%'
   AND objetivo_geral_id::text LIKE 'a1adb000-000_-000_-000_-00000000a00_'
   AND objetivo_geral_id != 'a1adb000-0000-0000-0000-00000000a000'::uuid;

-- ----------------------------------------------------------------------------
-- 5. NOVOS 9 KPIs taticos · 1 por area adm · sob o OKR geral unico
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  -- Hospitalidade (3 areas que viram 1 grupo visualmente)
  ('ADM-G-RESERVA',   '% atendidas no SLA · Reserva de Espaço',
   'Solicitacoes de reserva concluidas no prazo · base = todas concluidas no periodo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"reserva_espaco","metrica":"resolucao_no_sla","grupo":"hospitalidade"}'::jsonb),
  ('ADM-G-COZINHA',   '% atendidas no SLA · Cozinha',
   'Eventos com cozinha entregue no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"cozinha","metrica":"resolucao_no_sla","grupo":"hospitalidade"}'::jsonb),
  ('ADM-G-MANUTENCAO','% atendidas no SLA · Manutenção',
   'Manutencao concluida no prazo (preventiva e corretiva)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"manutencao","metrica":"resolucao_no_sla","grupo":"hospitalidade"}'::jsonb),

  -- Logistica (2 areas que viram 1 grupo)
  ('ADM-G-LOG-EST',   '% atendidas no SLA · Logística Estoque',
   'Pedidos de estoque entregues no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=95%', 95, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_estoque","metrica":"resolucao_no_sla","grupo":"logistica"}'::jsonb),
  ('ADM-G-LOG-COM',   '% atendidas no SLA · Logística Compras',
   'Compras entregues no prazo (3 semanas total padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_compras","metrica":"resolucao_no_sla","grupo":"logistica"}'::jsonb),

  -- Outras 4 areas isoladas
  ('ADM-G-TI',        '% atendidas no SLA · TI',
   'Chamados TI resolvidos no prazo (48h padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"ti","metrica":"resolucao_no_sla","grupo":"ti"}'::jsonb),
  ('ADM-G-RH',        '% atendidas no SLA · RH',
   'Demandas de RH concluidas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"rh","metrica":"resolucao_no_sla","grupo":"rh"}'::jsonb),
  ('ADM-G-FIN',       '% atendidas no SLA · Financeiro',
   'Reembolsos pagos e aprovacoes feitas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"financeiro","metrica":"resolucao_no_sla","grupo":"financeiro"}'::jsonb),
  ('ADM-G-CRIATIVO',  '% atendidas no SLA · Criativo',
   'Entregas criativas concluidas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0000-0000-0000-00000000a000'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"criativo","metrica":"resolucao_no_sla","grupo":"criativo"}'::jsonb)

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

-- Recalcula apos a mudanca
DO $$
DECLARE v jsonb;
BEGIN
  v := public.recalcular_todos_kpis_adm();
  RAISE NOTICE 'KPIs adm recalculados: %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio)
-- ----------------------------------------------------------------------------
-- SELECT id, nome, ativo FROM kpi_objetivos_gerais WHERE tipo_okr = 'operacional' ORDER BY ordem;
-- Espera: 1 ativo ("Aumentar atendimento..."), 9 inativos (Cozinha, Reserva etc)

-- SELECT id, indicador, ativo FROM kpi_indicadores_taticos WHERE tipo_kpi = 'operacional' ORDER BY id;
-- Espera: 9 ativos com prefixo ADM-G-*, 27 inativos com prefixo ADM-XX-NN

-- SELECT count(*) FROM kpi_krs WHERE objetivo_geral_id = 'a1adb000-0000-0000-0000-00000000a000'::uuid;
-- Espera: 3 KRs gerais
