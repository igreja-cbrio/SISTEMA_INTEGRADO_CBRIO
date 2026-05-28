-- ============================================================================
-- MIGRATION · Marketing · KPIs + capacidade + estimativa (Spec 005)
-- ============================================================================
-- 1. Funcao SQL fn_marketing_calcular_capacidade_semana (capacidade por membro)
-- 2. Funcao SQL fn_marketing_estimar_prazo (estimativa preliminar)
-- 3. 4 KPIs MKT-* registrados em kpi_indicadores_taticos
-- 4. Trigger SQL tg_marketing_cards_recalc_kpis em insert/update/delete cards
--
-- Coletores (kpiAutoCollector.js · em codigo JS · arquivo separado):
--   marketing.prazo_no_alvo · % cards entregues no prazo
--   marketing.lead_time_medio · avg(entregue_em - created_at) em dias
--   marketing.throughput · count cards entregues no periodo
--   marketing.razao_demanda_capacidade · esforco fila / capacidade equipe
--
-- valores={} · KPIs ficam em /minha-area e /marketing/analytics. Nao entram
-- na mandala NSM (Marcos 2026-05-28 · Marketing nao tem cross-impacto na
-- Jornada do convertido).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper · primeira segunda-feira <= data
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_marketing_segunda_da_semana(p_data date)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (p_data - ((EXTRACT(ISODOW FROM p_data) - 1) * INTERVAL '1 day'))::date
$$;

-- ----------------------------------------------------------------------------
-- 2. Capacidade da semana por membro (JSONB)
-- ----------------------------------------------------------------------------
-- Retorna 1 linha por membro ativo, com horas base / recorrentes / override /
-- alocadas / livres. Calculo do calendario (Spec 008) usa direto.
--
-- horas_base         = horas_semanais (do cadastro do membro)
-- horas_recorrentes  = SUM(duracao_h) dos compromissos da semana
-- horas_override     = override.horas_disponiveis se houver pra essa semana
-- horas_disponiveis  = COALESCE(override, base - recorrentes)
-- horas_alocadas     = SUM(esforco_medio_h dos cards atribuidos · em fila/em_producao
--                          com prazo_confirmado nesta semana)
-- horas_livres       = horas_disponiveis - horas_alocadas (pode ser negativo)

CREATE OR REPLACE FUNCTION public.fn_marketing_calcular_capacidade_semana(p_data_ref date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  membro_id          uuid,
  profile_id         uuid,
  habilidade         text,
  semana_inicio      date,
  semana_fim         date,
  horas_base         numeric,
  horas_recorrentes  numeric,
  horas_override     numeric,
  horas_disponiveis  numeric,
  horas_alocadas     numeric,
  horas_livres       numeric
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seg date;
  v_dom date;
BEGIN
  v_seg := public.fn_marketing_segunda_da_semana(p_data_ref);
  v_dom := v_seg + INTERVAL '6 days';

  RETURN QUERY
  WITH base AS (
    SELECT m.id, m.profile_id, m.habilidade, m.horas_semanais
      FROM public.marketing_membros m
     WHERE m.ativo = true AND m.deleted_at IS NULL
  ),
  rec AS (
    SELECT r.membro_id, SUM(r.duracao_h) AS horas_recorrentes
      FROM public.marketing_compromissos_recorrentes r
     WHERE r.ativo = true AND r.deleted_at IS NULL
     GROUP BY r.membro_id
  ),
  ovr AS (
    SELECT o.membro_id, o.horas_disponiveis AS horas_override
      FROM public.marketing_capacidade_override o
     WHERE o.semana_inicio = v_seg AND o.deleted_at IS NULL
  ),
  aloc AS (
    SELECT c.atribuido_a AS membro_id,
           SUM(COALESCE(t.esforco_medio_h, 0)) AS horas_alocadas
      FROM public.marketing_kanban_cards c
      LEFT JOIN public.marketing_etiquetas_tipo t ON t.id = c.etiqueta_tipo_id
     WHERE c.deleted_at IS NULL
       AND c.atribuido_a IS NOT NULL
       AND c.estado IN ('fila','em_producao')
       AND COALESCE(c.prazo_confirmado, c.prazo_preliminar)::date BETWEEN v_seg AND v_dom
     GROUP BY c.atribuido_a
  )
  SELECT b.id, b.profile_id, b.habilidade,
         v_seg, v_dom::date,
         b.horas_semanais,
         COALESCE(r.horas_recorrentes, 0),
         o.horas_override,
         COALESCE(o.horas_override, b.horas_semanais - COALESCE(r.horas_recorrentes, 0)),
         COALESCE(a.horas_alocadas, 0),
         COALESCE(o.horas_override, b.horas_semanais - COALESCE(r.horas_recorrentes, 0))
           - COALESCE(a.horas_alocadas, 0)
    FROM base b
    LEFT JOIN rec r ON r.membro_id = b.id
    LEFT JOIN ovr o ON o.membro_id = b.id
    LEFT JOIN aloc a ON a.membro_id = b.id
   ORDER BY b.habilidade, b.id;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) IS
  'Capacidade da semana por membro Marketing · base do calendario (Spec 008) e da estimativa preliminar (Spec 005).';

GRANT EXECUTE ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Estimativa preliminar de prazo
-- ----------------------------------------------------------------------------
-- Heuristica MVP (Marcos: pra MVP, estimativa preliminar sinaliza realismo;
-- coordenador confirma depois com prazo_confirmado):
--
--   esforco         = etiqueta_tipo.esforco_medio_h
--   capacidade_dia  = SUM(horas_livres da semana) / 5 dias uteis
--   fator_demanda   = 0.6  -- 60% da capacidade pra demanda externa
--   dias_necessarios = CEIL(esforco / (capacidade_dia * fator))
--   data_sugerida   = GREATEST(today + dias_necessarios + 1, data_alvo)
--
-- Se esforco_medio_h NULL · retorna data_alvo (ou hoje+5 se nao informada)
-- + observacao "tipo ainda nao calibrado".

CREATE OR REPLACE FUNCTION public.fn_marketing_estimar_prazo(
  p_tipo_id  uuid,
  p_data_alvo date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_esforco numeric;
  v_capacidade_dia numeric;
  v_dias_necessarios integer;
  v_data_sugerida date;
  v_observacao text;
  v_fator numeric := 0.6;
BEGIN
  SELECT esforco_medio_h INTO v_esforco
    FROM public.marketing_etiquetas_tipo
   WHERE id = p_tipo_id AND ativo = true;

  IF v_esforco IS NULL THEN
    v_data_sugerida := COALESCE(p_data_alvo, CURRENT_DATE + INTERVAL '5 days');
    RETURN jsonb_build_object(
      'data_sugerida', v_data_sugerida,
      'dias_uteis', NULL,
      'esforco_h', NULL,
      'capacidade_dia', NULL,
      'observacao', 'Tipo ainda sem calibracao · estimativa eh aproximada · Pedro confirma o prazo real depois.'
    );
  END IF;

  -- Capacidade media diaria da semana atual (livre · ja descontado recorrentes + alocacoes)
  SELECT GREATEST(SUM(horas_livres), 0) / 5 INTO v_capacidade_dia
    FROM public.fn_marketing_calcular_capacidade_semana(CURRENT_DATE);

  IF v_capacidade_dia IS NULL OR v_capacidade_dia <= 0 THEN
    -- Fila cheia · estimativa pessimista · 2 semanas pra encaixar
    v_dias_necessarios := 10;
    v_observacao := 'Equipe sem capacidade livre nesta semana · prazo realista em ~2 semanas.';
  ELSE
    v_dias_necessarios := GREATEST(1, CEIL(v_esforco / (v_capacidade_dia * v_fator))::integer);
    v_observacao := 'Estimativa preliminar baseada em capacidade media. Pedro confirma o prazo real depois.';
  END IF;

  v_data_sugerida := CURRENT_DATE + (v_dias_necessarios + 1) * INTERVAL '1 day';
  IF p_data_alvo IS NOT NULL AND p_data_alvo > v_data_sugerida THEN
    v_data_sugerida := p_data_alvo;
  END IF;

  RETURN jsonb_build_object(
    'data_sugerida', v_data_sugerida,
    'dias_uteis', v_dias_necessarios,
    'esforco_h', v_esforco,
    'capacidade_dia', v_capacidade_dia,
    'observacao', v_observacao
  );
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_estimar_prazo(uuid, date) IS
  'Estimativa preliminar pra mostrar no Solicitacoes (Spec 010). Calibragem evolui conforme cycle time real.';

GRANT EXECUTE ON FUNCTION public.fn_marketing_estimar_prazo(uuid, date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. KPIs MKT-* registrados em kpi_indicadores_taticos
-- ----------------------------------------------------------------------------
-- Inseridos com valores={} · ficam em /minha-area + /marketing/analytics
-- mas NAO entram na mandala (sem cross-impacto na Jornada do convertido).

INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, area, periodicidade, unidade, fonte_auto,
  valores, pilar, tipo_kpi, ativo, meta_descricao, meta_valor,
  apuracao, descricao
) VALUES
  ('MKT-PRAZO', '% de demandas entregues no prazo',
   'marketing', 'semanal', '%', 'marketing.prazo_no_alvo',
   '{}'::text[], 'marketing', 'tatico', true,
   '>=85% das demandas entregues no prazo confirmado', 85,
   'Cards entregues no prazo / Cards entregues (semanal)',
   'Cards com entregue_em <= prazo_confirmado dividido pelo total de entregues na semana.'),

  ('MKT-LEAD', 'Lead time medio',
   'marketing', 'semanal', 'dias', 'marketing.lead_time_medio',
   '{}'::text[], 'marketing', 'tatico', true,
   '<=7 dias do pedido a entrega', 7,
   'avg(entregue_em - created_at) em dias',
   'Tempo medio entre criacao do card e entrega. Calibra expectativa de prazo.'),

  ('MKT-THROUGHPUT', 'Throughput semanal',
   'marketing', 'semanal', 'cards', 'marketing.throughput',
   '{}'::text[], 'marketing', 'tatico', true,
   '>=5 cards entregues por semana', 5,
   'count(cards entregues) na semana',
   'Quantidade de cards finalizados na semana. Detecta gargalos quando cai.'),

  ('MKT-DEM-CAP', 'Razao demanda / capacidade',
   'marketing', 'semanal', '%', 'marketing.razao_demanda_capacidade',
   '{}'::text[], 'marketing', 'tatico', true,
   '<=100% (sem fila acumulada)', 100,
   'esforco fila / capacidade disponivel (semanal)',
   'Soma de esforco_medio_h dos cards em fila+em_producao dividida pela capacidade livre da equipe. >100% sinaliza fila crescendo.')

ON CONFLICT (id) DO UPDATE
  SET indicador     = EXCLUDED.indicador,
      area          = EXCLUDED.area,
      periodicidade = EXCLUDED.periodicidade,
      unidade       = EXCLUDED.unidade,
      fonte_auto    = EXCLUDED.fonte_auto,
      valores       = EXCLUDED.valores,
      pilar         = EXCLUDED.pilar,
      tipo_kpi      = EXCLUDED.tipo_kpi,
      ativo         = EXCLUDED.ativo,
      meta_descricao = EXCLUDED.meta_descricao,
      meta_valor    = EXCLUDED.meta_valor,
      apuracao      = EXCLUDED.apuracao,
      descricao     = EXCLUDED.descricao,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- 5. Trigger · recalculo automatico dos KPIs MKT-* em mudanca de cards
-- ----------------------------------------------------------------------------
-- Cards mudam de estado, sao criados, deletados · recalcula KPIs do periodo
-- usando funcao existente kpi_recalcular_para_data (criada nas migrations
-- de kpis-trigger-realtime).
--
-- Reaproveita o pattern do tg_cultos_recalc_kpis: AFTER STATEMENT pra agregar
-- rajadas (batch insert nao chama N vezes).

CREATE OR REPLACE FUNCTION public.fn_marketing_cards_recalc_kpis()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_data date;
BEGIN
  -- Para statement-level triggers · pega as datas distintas das linhas mudadas
  -- via transition tables. Recalcula KPIs MKT-* pra cada data distinta.
  --
  -- Para simplificar: recalcula sempre o periodo corrente (data atual).
  -- Cards editados em datas passadas (raro) podem nao recalcular periodos
  -- antigos · MVP aceita o trade-off porque KPIs sao predominantemente
  -- "do periodo atual" no painel analytics.

  v_data := CURRENT_DATE;

  -- Aciona recalculo · usa funcao existente do kpis-trigger-realtime
  -- que recalcula todos KPIs ativos cobertos pela data
  PERFORM public.kpi_recalcular_para_data(v_data);

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_recalc_kpis() IS
  'Recalcula KPIs MKT-* quando cards mudam · AFTER STATEMENT (agrega rajadas).';

-- 3 triggers (INSERT, UPDATE, DELETE) · Postgres exige separados pra
-- transition tables · mesmo pattern de dados_brutos.
DROP TRIGGER IF EXISTS tg_marketing_cards_recalc_kpis_ins ON public.marketing_kanban_cards;
DROP TRIGGER IF EXISTS tg_marketing_cards_recalc_kpis_upd ON public.marketing_kanban_cards;
DROP TRIGGER IF EXISTS tg_marketing_cards_recalc_kpis_del ON public.marketing_kanban_cards;

CREATE TRIGGER tg_marketing_cards_recalc_kpis_ins
  AFTER INSERT ON public.marketing_kanban_cards
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_marketing_cards_recalc_kpis();

CREATE TRIGGER tg_marketing_cards_recalc_kpis_upd
  AFTER UPDATE ON public.marketing_kanban_cards
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_marketing_cards_recalc_kpis();

CREATE TRIGGER tg_marketing_cards_recalc_kpis_del
  AFTER DELETE ON public.marketing_kanban_cards
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_marketing_cards_recalc_kpis();
