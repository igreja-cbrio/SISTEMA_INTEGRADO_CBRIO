-- ============================================================================
-- KPIs ADMINISTRATIVOS · puxam de vw_solicitacoes_sla
--
-- Fase C do desenho · Marcos definiu 7 areas adm (reserva_espaco, cozinha,
-- manutencao, logistica_estoque, logistica_compras, ti, rh, financeiro) ·
-- mas separadas em areas operacionais distintas no enum area_adm_resp.
--
-- Cada area vira um OKR Geral com tipo_okr='operacional'. KPIs taticos
-- saem direto da view de solicitacoes via funcao SQL agg_solicitacoes_kpi().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tipo de OKR · adiciona 'operacional' alem de qualitativo/quantitativo
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_objetivos_gerais
  DROP CONSTRAINT IF EXISTS kpi_objetivos_gerais_tipo_okr_check;
ALTER TABLE public.kpi_objetivos_gerais
  ADD CONSTRAINT kpi_objetivos_gerais_tipo_okr_check
  CHECK (tipo_okr IS NULL OR tipo_okr IN ('qualitativo', 'quantitativo', 'operacional'));

-- E o mesmo em kpi_metas_institucionais
ALTER TABLE public.kpi_metas_institucionais
  DROP CONSTRAINT IF EXISTS kpi_metas_institucionais_tipo_kpi_check;
ALTER TABLE public.kpi_metas_institucionais
  ADD CONSTRAINT kpi_metas_institucionais_tipo_kpi_check
  CHECK (tipo_kpi IN ('qualitativo', 'quantitativo', 'operacional'));

-- Idem em kpi_indicadores_taticos
ALTER TABLE public.kpi_indicadores_taticos
  DROP CONSTRAINT IF EXISTS kpi_indicadores_taticos_tipo_kpi_check;
ALTER TABLE public.kpi_indicadores_taticos
  ADD CONSTRAINT kpi_indicadores_taticos_tipo_kpi_check
  CHECK (tipo_kpi IS NULL OR tipo_kpi IN ('qualitativo', 'quantitativo', 'operacional'));

-- ----------------------------------------------------------------------------
-- 2. Cria OKRs gerais para cada area adm (8 OKRs operacionais)
--    UUIDs determinísticos pra facilitar re-rodar
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (id, direcionador_id, nome, indicador_geral, valores, ordem, ativo, tipo_okr)
VALUES
  ('a1adb-0000-0001-0001-000000000001'::uuid, '11111111-1111-1111-1111-111111111111',
   'Reserva de Espaço · servir bem os ministerios',
   '% solicitacoes de espaco entregues prontas + NPS interno',
   ARRAY[]::text[], 30, true, 'operacional'),
  ('a1adb-0000-0002-0002-000000000002'::uuid, '11111111-1111-1111-1111-111111111111',
   'Cozinha · servir bem os eventos',
   '% eventos com cozinha entregue conforme + NPS interno',
   ARRAY[]::text[], 31, true, 'operacional'),
  ('a1adb-0000-0003-0003-000000000003'::uuid, '11111111-1111-1111-1111-111111111111',
   'Manutencao · ambiente impecavel',
   '% solicitacoes de manutencao no SLA + NPS interno',
   ARRAY[]::text[], 32, true, 'operacional'),
  ('a1adb-0000-0004-0004-000000000004'::uuid, '11111111-1111-1111-1111-111111111111',
   'Logistica Estoque · entrega imediata',
   '% pedidos do estoque entregues no SLA + acuracidade',
   ARRAY[]::text[], 33, true, 'operacional'),
  ('a1adb-0000-0005-0005-000000000005'::uuid, '11111111-1111-1111-1111-111111111111',
   'Logistica Compras · profissionalizar aquisicoes',
   '% compras entregues no SLA + savings',
   ARRAY[]::text[], 34, true, 'operacional'),
  ('a1adb-0000-0006-0006-000000000006'::uuid, '11111111-1111-1111-1111-111111111111',
   'TI · tecnologia invisivel e estavel',
   '% chamados TI resolvidos no SLA + uptime',
   ARRAY[]::text[], 35, true, 'operacional'),
  ('a1adb-0000-0007-0007-000000000007'::uuid, '11111111-1111-1111-1111-111111111111',
   'RH · clima, retencao e aderencia aos valores',
   '% demandas RH no SLA + retencao + treinamento',
   ARRAY[]::text[], 36, true, 'operacional'),
  ('a1adb-0000-0008-0008-000000000008'::uuid, '11111111-1111-1111-1111-111111111111',
   'Financeiro Operacional · disciplina e responsividade',
   '% reembolsos no prazo + % aprovacoes no prazo',
   ARRAY[]::text[], 37, true, 'operacional')
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  indicador_geral = EXCLUDED.indicador_geral,
  tipo_okr = EXCLUDED.tipo_okr,
  ordem = EXCLUDED.ordem;

-- ----------------------------------------------------------------------------
-- 3. KPIs taticos · 3 por area adm (1 resposta SLA, 1 resolucao SLA, 1 NPS)
--    fonte_auto = 'solicitacoes' + formula_config indica area + metrica
-- ----------------------------------------------------------------------------

-- Helper macro: pra cada area, gera 3 KPIs (resposta_sla / resolucao_sla / nps)
-- Como nao tem funcao macro em SQL puro, vou listar explicitamente.

INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  -- RESERVA DE ESPACO
  ('ADM-RESPESP-01', '% resposta no SLA', 'Solicitacoes de reserva de espaco respondidas dentro do prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0001-0001-000000000001'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"reserva_espaco","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-RESPESP-02', '% conclusao no SLA', 'Solicitacoes de reserva de espaco concluidas dentro do prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb-0000-0001-0001-000000000001'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"reserva_espaco","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-RESPESP-03', 'NPS interno', 'Avaliacao 0-10 dos ministerios sobre reserva de espacos',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0001-0001-000000000001'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"reserva_espaco","metrica":"nps_medio"}'::jsonb),

  -- COZINHA
  ('ADM-COZ-01', '% resposta no SLA', 'Solicitacoes de cozinha respondidas dentro do prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0002-0002-000000000002'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"cozinha","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-COZ-02', '% entrega no SLA', 'Eventos com cozinha entregue dentro do prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=95%', 95, '%', true, true,
   'a1adb-0000-0002-0002-000000000002'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"cozinha","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-COZ-03', 'NPS interno', 'Avaliacao dos ministerios sobre cozinha',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0002-0002-000000000002'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"cozinha","metrica":"nps_medio"}'::jsonb),

  -- MANUTENCAO
  ('ADM-MAN-01', '% resposta no SLA', 'Solicitacoes de manutencao respondidas dentro do prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0003-0003-000000000003'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"manutencao","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-MAN-02', '% resolucao no SLA', 'Manutencao concluida dentro do prazo (preventiva + corretiva)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb-0000-0003-0003-000000000003'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"manutencao","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-MAN-03', 'NPS interno', 'Avaliacao dos ministerios sobre manutencao',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0003-0003-000000000003'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"manutencao","metrica":"nps_medio"}'::jsonb),

  -- LOGISTICA ESTOQUE
  ('ADM-LOGEST-01', '% resposta no SLA', 'Solicitacoes de estoque respondidas no prazo (48h padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=95%', 95, '%', true, true,
   'a1adb-0000-0004-0004-000000000004'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_estoque","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-LOGEST-02', '% entrega no SLA', 'Estoque entregue no prazo (72h padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=95%', 95, '%', true, true,
   'a1adb-0000-0004-0004-000000000004'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_estoque","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-LOGEST-03', 'NPS interno', 'Avaliacao dos ministerios sobre estoque',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0004-0004-000000000004'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_estoque","metrica":"nps_medio"}'::jsonb),

  -- LOGISTICA COMPRAS
  ('ADM-LOGCOM-01', '% resposta no SLA', 'Solicitacoes de compras respondidas no prazo (cotacao em 1 semana)',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0005-0005-000000000005'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_compras","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-LOGCOM-02', '% entrega no SLA', 'Compras entregues no prazo (3 semanas total padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb-0000-0005-0005-000000000005'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_compras","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-LOGCOM-03', 'NPS interno', 'Avaliacao dos ministerios sobre compras',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0005-0005-000000000005'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"logistica_compras","metrica":"nps_medio"}'::jsonb),

  -- TI
  ('ADM-TI-01', '% resposta no SLA', 'Chamados TI respondidos no prazo (24h padrao, 4h urgente)',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0006-0006-000000000006'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"ti","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-TI-02', '% resolucao no SLA', 'Chamados TI resolvidos no prazo (48h padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb-0000-0006-0006-000000000006'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"ti","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-TI-03', 'NPS interno', 'Avaliacao dos ministerios sobre TI',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0006-0006-000000000006'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"ti","metrica":"nps_medio"}'::jsonb),

  -- RH
  ('ADM-RH-01', '% resposta no SLA', 'Demandas de RH respondidas no prazo (varia por subcategoria)',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0007-0007-000000000007'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"rh","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-RH-02', '% resolucao no SLA', 'Demandas de RH concluidas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb-0000-0007-0007-000000000007'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"rh","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-RH-03', 'NPS interno', 'Avaliacao dos ministerios sobre RH',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0007-0007-000000000007'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"rh","metrica":"nps_medio"}'::jsonb),

  -- FINANCEIRO OPERACIONAL
  ('ADM-FIN-01', '% reembolsos no SLA', 'Reembolsos pagos no prazo (5d padrao)',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0008-0008-000000000008'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"financeiro","subcategoria":"reembolso","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-FIN-02', '% aprovacoes no SLA', 'Aprovacoes de gasto (acima da alcada) feitas no prazo (48h)',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb-0000-0008-0008-000000000008'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"financeiro","subcategoria":"aprovacao","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-FIN-03', 'NPS interno', 'Avaliacao dos ministerios sobre Financeiro Operacional',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb-0000-0008-0008-000000000008'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"financeiro","metrica":"nps_medio"}'::jsonb)

ON CONFLICT (id) DO UPDATE SET
  indicador = EXCLUDED.indicador,
  descricao = EXCLUDED.descricao,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  unidade = EXCLUDED.unidade,
  tipo_kpi = EXCLUDED.tipo_kpi,
  tipo_calculo = EXCLUDED.tipo_calculo,
  formula_config = EXCLUDED.formula_config,
  objetivo_geral_id = EXCLUDED.objetivo_geral_id,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 4. Funcao agg_solicitacoes_kpi · calcula valor de KPI adm
--    Le da vw_solicitacoes_sla agrupando por area_responsavel + periodo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agg_solicitacoes_kpi(
  p_area_responsavel text,
  p_subcategoria text,
  p_metrica text,
  p_inicio date,
  p_fim date
) RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total int;
  v_match int;
  v_avg_nps numeric;
BEGIN
  IF p_metrica = 'nps_medio' THEN
    SELECT avg(nps_nota) INTO v_avg_nps
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND (p_subcategoria IS NULL OR subcategoria = p_subcategoria)
       AND nps_nota IS NOT NULL
       AND coalesce(concluido_em, created_at)::date BETWEEN p_inicio AND p_fim;
    RETURN v_avg_nps;

  ELSIF p_metrica = 'resposta_no_sla' THEN
    SELECT count(*) INTO v_total
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND (p_subcategoria IS NULL OR subcategoria = p_subcategoria)
       AND respondido_em IS NOT NULL
       AND respondido_em::date BETWEEN p_inicio AND p_fim;
    IF v_total = 0 THEN RETURN NULL; END IF;
    SELECT count(*) INTO v_match
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND (p_subcategoria IS NULL OR subcategoria = p_subcategoria)
       AND sla_resposta_status = 'respondeu_no_prazo'
       AND respondido_em::date BETWEEN p_inicio AND p_fim;
    RETURN round((v_match::numeric / v_total) * 100, 2);

  ELSIF p_metrica = 'resolucao_no_sla' THEN
    SELECT count(*) INTO v_total
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND (p_subcategoria IS NULL OR subcategoria = p_subcategoria)
       AND concluido_em IS NOT NULL
       AND concluido_em::date BETWEEN p_inicio AND p_fim;
    IF v_total = 0 THEN RETURN NULL; END IF;
    SELECT count(*) INTO v_match
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND (p_subcategoria IS NULL OR subcategoria = p_subcategoria)
       AND sla_resolucao_status = 'concluiu_no_prazo'
       AND concluido_em::date BETWEEN p_inicio AND p_fim;
    RETURN round((v_match::numeric / v_total) * 100, 2);

  ELSIF p_metrica = 'urgentes_pct' THEN
    -- % de solicitacoes marcadas como urgente · alerta de planejamento ruim
    SELECT count(*) INTO v_total
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND created_at::date BETWEEN p_inicio AND p_fim;
    IF v_total = 0 THEN RETURN NULL; END IF;
    SELECT count(*) INTO v_match
      FROM public.vw_solicitacoes_sla
     WHERE area_responsavel = p_area_responsavel::area_adm_resp
       AND eh_urgente = true
       AND created_at::date BETWEEN p_inicio AND p_fim;
    RETURN round((v_match::numeric / v_total) * 100, 2);
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agg_solicitacoes_kpi(text, text, text, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.agg_solicitacoes_kpi IS
  'Calcula KPI adm a partir de vw_solicitacoes_sla. Metricas: nps_medio, resposta_no_sla, resolucao_no_sla, urgentes_pct.';

-- ----------------------------------------------------------------------------
-- 5. Estende _kpi_agregar_dado pra suportar fonte 'solicitacoes'
--    via formula_config = {"fonte":"solicitacoes", ...}
-- ----------------------------------------------------------------------------
-- A funcao recalcular_kpi() (fase 6c) ja chama _kpi_agregar_dado quando
-- tipo_calculo != 'manual'. Mas hoje so suporta dados_brutos + fontes
-- naturais. Vou criar uma funcao especifica · recalcular_kpi_adm()
-- que sera chamada na recalculate-all.

CREATE OR REPLACE FUNCTION public.recalcular_kpi_adm(
  p_kpi_id text,
  p_periodo_referencia text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_kpi RECORD;
  v_periodo text;
  v_inicio date;
  v_fim date;
  v_valor numeric;
  v_area text;
  v_sub text;
  v_metrica text;
BEGIN
  SELECT id, periodicidade, tipo_calculo, formula_config, periodo_offset_meses
    INTO v_kpi
    FROM public.kpi_indicadores_taticos
   WHERE id = p_kpi_id;

  IF v_kpi IS NULL THEN
    RETURN jsonb_build_object('erro', 'KPI nao encontrado');
  END IF;
  IF v_kpi.formula_config IS NULL OR v_kpi.formula_config->>'fonte' != 'solicitacoes' THEN
    RETURN jsonb_build_object('erro', 'KPI nao tem fonte solicitacoes');
  END IF;

  v_area := v_kpi.formula_config->>'area_responsavel';
  v_sub  := v_kpi.formula_config->>'subcategoria';
  v_metrica := v_kpi.formula_config->>'metrica';

  -- Determina periodo
  v_periodo := COALESCE(p_periodo_referencia,
    CASE v_kpi.periodicidade
      WHEN 'mensal'     THEN to_char(current_date, 'YYYY-MM')
      WHEN 'trimestral' THEN to_char(current_date, 'YYYY') || '-Q' || ((extract(month from current_date)::int - 1) / 3 + 1)::text
      WHEN 'semestral'  THEN to_char(current_date, 'YYYY') || '-S' || (CASE WHEN extract(month from current_date) <= 6 THEN 1 ELSE 2 END)::text
      WHEN 'anual'      THEN to_char(current_date, 'YYYY')
      ELSE to_char(current_date, 'YYYY-MM')
    END);

  SELECT * INTO v_inicio, v_fim FROM public._kpi_periodo_dates(v_kpi.periodicidade, v_periodo);
  IF v_inicio IS NULL THEN
    RETURN jsonb_build_object('erro', 'Periodo invalido', 'periodo', v_periodo);
  END IF;

  v_valor := public.agg_solicitacoes_kpi(v_area, v_sub, v_metrica, v_inicio, v_fim);

  -- UPSERT no cache kpi_valores_calculados (mesmo padrao do recalcular_kpi)
  INSERT INTO public.kpi_valores_calculados (kpi_id, periodo_referencia, valor, calculado_em, detalhes)
  VALUES (p_kpi_id, v_periodo, v_valor, now(),
          jsonb_build_object('area_responsavel', v_area, 'subcategoria', v_sub, 'metrica', v_metrica, 'fonte', 'solicitacoes'))
  ON CONFLICT (kpi_id, periodo_referencia) DO UPDATE
    SET valor = EXCLUDED.valor,
        calculado_em = now(),
        detalhes = EXCLUDED.detalhes;

  RETURN jsonb_build_object(
    'kpi_id', p_kpi_id,
    'periodo', v_periodo,
    'valor', v_valor,
    'area', v_area,
    'metrica', v_metrica
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_kpi_adm(text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Recalcula todos os KPIs adm de uma vez (helper)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_todos_kpis_adm()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_total int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND tipo_kpi = 'operacional'
       AND formula_config->>'fonte' = 'solicitacoes'
  LOOP
    PERFORM public.recalcular_kpi_adm(r.id, NULL);
    v_total := v_total + 1;
  END LOOP;
  RETURN jsonb_build_object('kpis_recalculados', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_todos_kpis_adm() TO authenticated, service_role;

-- Roda 1x agora pra popular trajetoria
DO $$
DECLARE v jsonb;
BEGIN
  v := public.recalcular_todos_kpis_adm();
  RAISE NOTICE 'KPIs adm recalculados: %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT k.id, k.indicador, k.formula_config->>'area_responsavel' AS area, kv.valor
--   FROM kpi_indicadores_taticos k
--   LEFT JOIN kpi_valores_calculados kv ON kv.kpi_id = k.id
--  WHERE k.tipo_kpi = 'operacional'
--  ORDER BY k.id;
