-- ============================================================================
-- FASE 6C · Calculo automatico de KPIs a partir de dados brutos
--
-- O que faz:
--   1. Adiciona tipos de dado novos (voluntarios_inativos_3m, solicitacoes_*,
--      nps_*) preparando para modulos futuros.
--   2. Atualiza mapeamento dos KPIs que estavam manual (voluntarios inativos,
--      satisfacao, garantir alocacao, NPS).
--   3. Tabela kpi_valores_calculados (cache de valores computados).
--   4. Funcoes de calculo:
--      - calcular_kpi(kpi_id, periodo) → numeric
--      - recalcular_kpi(kpi_id, periodo) → upsert
--      - recalcular_kpis_por_dado(tipo, area, data) → recalcula todos os
--        KPIs cuja formula depende desse dado
--   5. Trigger em dados_brutos que dispara recalculo automatico.
--   6. Atualiza vw_kpi_trajetoria_atual pra usar valor calculado quando
--      tipo_calculo != 'manual'.
-- ============================================================================

-- ============================================================================
-- 1. TIPOS DE DADO NOVOS
-- ============================================================================
INSERT INTO public.tipos_dado_bruto (id, nome, descricao, unidade, agregacao, granularidade, origem_tabela, ordem) VALUES
  -- Voluntariado / inativos
  ('voluntarios_inativos_3m',  'Voluntários inativos (>3m)',  'Voluntários sem servir há mais de 90 dias (count distinct)',     'pessoas', 'count_distinct', 'mensal', 'mem_voluntarios', 45),
  ('voluntarios_recuperados',  'Voluntários recuperados',     'Voluntários que estavam inativos (>3m) e voltaram a servir',     'pessoas', 'count_distinct', 'mensal', NULL, 46),

  -- Solicitacoes (modulo futuro)
  ('solicitacoes_capelania_recebidas',  'Solicitações de capelania recebidas',     'Membros que solicitaram capelania', 'solicitacoes', 'count', 'mensal', NULL, 83),
  ('solicitacoes_aconselhamento_recebidas', 'Solicitações de aconselhamento recebidas', 'Membros que solicitaram aconselhamento', 'solicitacoes', 'count', 'mensal', NULL, 84),
  ('solicitacoes_servir_recebidas', 'Solicitações de servir recebidas', 'Membros que solicitaram virar voluntários',          'solicitacoes', 'count', 'mensal', NULL, 85),
  ('solicitacoes_servir_alocadas',  'Solicitações de servir alocadas', 'Solicitantes que foram alocados em ministério',       'solicitacoes', 'count', 'mensal', NULL, 86),

  -- NPS (modulo futuro)
  ('nps_lideres',     'NPS dos líderes',     'Net Promoter Score dos líderes de grupo (0-10)',  'nota', 'avg', 'semestral', NULL, 94),
  ('nps_voluntarios', 'NPS dos voluntários', 'Net Promoter Score dos voluntários (0-10)',       'nota', 'avg', 'semestral', NULL, 95),
  ('nps_geral',       'NPS geral',           'Net Promoter Score da igreja como um todo',       'nota', 'avg', 'semestral', NULL, 96),

  -- Doacoes
  ('doacoes_qualidade', 'Qualidade dos doadores',  'Score composto de regularidade + ticket médio (0-100)', 'score', 'avg', 'mensal', NULL, 53)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
      unidade = EXCLUDED.unidade, agregacao = EXCLUDED.agregacao,
      granularidade = EXCLUDED.granularidade, origem_tabela = EXCLUDED.origem_tabela,
      ordem = EXCLUDED.ordem;

-- ============================================================================
-- 2. ATUALIZAR MAPEAMENTO DOS KPIs (que estavam manual)
-- ============================================================================

-- Recuperar voluntarios inativos → razao (recuperados / inativos)
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'razao',
  formula_config = '{"numerador": "voluntarios_recuperados", "denominador": "voluntarios_inativos_3m"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Recuperar voluntários inativos');

-- Satisfacao lideres → manual com nps_lideres pre-config (delta_abs vs ciclo anterior)
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_abs',
  formula_config = '{"dado_tipo": "nps_lideres", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar a satisfacao dos lideres grupos');

-- Satisfacao voluntarios → delta_abs vs ciclo anterior
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_abs',
  formula_config = '{"dado_tipo": "nps_voluntarios", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar a satisfação de voluntários');

-- Melhorar qualidade do Next → delta_abs vs ciclo anterior
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_abs',
  formula_config = '{"dado_tipo": "nps_next", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Melhorar qualidade do Next');

-- Garantir alocacao → razao (alocadas / recebidas)
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'razao',
  formula_config = '{"numerador": "solicitacoes_servir_alocadas", "denominador": "solicitacoes_servir_recebidas"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Garantir que todos que desejam servir sejam alocados em alguma área');

-- Capelania (atualizar pra usar atendidas/recebidas como razao)
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'razao',
  formula_config = '{"numerador": "solicitacoes_capelania", "denominador": "solicitacoes_capelania_recebidas"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de solicitações atendidas de capelania');

-- Aconselhamento (idem)
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'razao',
  formula_config = '{"numerador": "solicitacoes_aconselh", "denominador": "solicitacoes_aconselhamento_recebidas"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de solicitações atendidas de aconselhamento');

-- Melhorar Qualidade de doadores → delta_pct
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "doacoes_qualidade", "comparacao": "mes_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Melhorar Qualidade de doadores');

-- ============================================================================
-- 3. TABELA DE VALORES CALCULADOS (cache)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kpi_valores_calculados (
  kpi_id              text NOT NULL REFERENCES public.kpi_indicadores_taticos(id) ON DELETE CASCADE,
  periodo_referencia  text NOT NULL,
  valor_calculado     numeric,
  detalhes            jsonb,                              -- {atual: X, anterior: Y, formula: 'delta_pct', ...}
  calculado_em        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (kpi_id, periodo_referencia)
);

CREATE INDEX IF NOT EXISTS idx_kpi_valores_calc_data ON public.kpi_valores_calculados (calculado_em DESC);

ALTER TABLE public.kpi_valores_calculados ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "kpi_valores_calc_read" ON public.kpi_valores_calculados FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 4. FUNCOES DE CALCULO
-- ============================================================================

-- Helper: data inicio/fim de um periodo
CREATE OR REPLACE FUNCTION public._kpi_periodo_dates(p_periodicidade text, p_periodo_referencia text)
RETURNS TABLE (data_inicio date, data_fim date)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_year int;
  v_month int;
  v_q int;
  v_s int;
  v_w int;
BEGIN
  -- Periodos no formato:
  --   '2026-05'    (mensal)
  --   '2026-Q2'    (trimestral)
  --   '2026-S1'    (semestral)
  --   '2026'       (anual)
  --   '2026-W18'   (semanal)

  IF p_periodo_referencia ~ '^\d{4}-\d{2}$' THEN
    -- Mensal
    v_year  := substring(p_periodo_referencia, 1, 4)::int;
    v_month := substring(p_periodo_referencia, 6, 2)::int;
    data_inicio := make_date(v_year, v_month, 1);
    data_fim    := (data_inicio + interval '1 month - 1 day')::date;

  ELSIF p_periodo_referencia ~ '^\d{4}-Q\d$' THEN
    -- Trimestral
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_q    := substring(p_periodo_referencia, 7, 1)::int;
    data_inicio := make_date(v_year, (v_q - 1) * 3 + 1, 1);
    data_fim    := (data_inicio + interval '3 months - 1 day')::date;

  ELSIF p_periodo_referencia ~ '^\d{4}-S\d$' THEN
    -- Semestral
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_s    := substring(p_periodo_referencia, 7, 1)::int;
    data_inicio := make_date(v_year, (v_s - 1) * 6 + 1, 1);
    data_fim    := (data_inicio + interval '6 months - 1 day')::date;

  ELSIF p_periodo_referencia ~ '^\d{4}$' THEN
    -- Anual
    v_year := p_periodo_referencia::int;
    data_inicio := make_date(v_year, 1, 1);
    data_fim    := make_date(v_year, 12, 31);

  ELSIF p_periodo_referencia ~ '^\d{4}-W\d{2}$' THEN
    -- Semanal (ISO week)
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_w    := substring(p_periodo_referencia, 7, 2)::int;
    data_inicio := (date_trunc('year', make_date(v_year, 1, 4)) + (v_w - 1) * interval '1 week')::date - extract(dow from make_date(v_year, 1, 4))::int + 1;
    data_fim := data_inicio + 6;
  ELSE
    RETURN;
  END IF;

  RETURN NEXT;
END;
$$;

-- Soma agregada de um tipo+area+periodo
CREATE OR REPLACE FUNCTION public._kpi_agregar_dado(
  p_dado_tipo text,
  p_area text,
  p_data_inicio date,
  p_data_fim date
) RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_agregacao text;
  v_resultado numeric;
BEGIN
  SELECT agregacao INTO v_agregacao FROM public.tipos_dado_bruto WHERE id = p_dado_tipo;
  IF v_agregacao IS NULL THEN RETURN NULL; END IF;

  IF v_agregacao = 'sum' THEN
    SELECT sum(valor) INTO v_resultado FROM public.dados_brutos
     WHERE tipo_id = p_dado_tipo AND area = p_area AND data BETWEEN p_data_inicio AND p_data_fim;
  ELSIF v_agregacao = 'avg' THEN
    SELECT avg(valor) INTO v_resultado FROM public.dados_brutos
     WHERE tipo_id = p_dado_tipo AND area = p_area AND data BETWEEN p_data_inicio AND p_data_fim;
  ELSIF v_agregacao = 'count' THEN
    SELECT count(*) INTO v_resultado FROM public.dados_brutos
     WHERE tipo_id = p_dado_tipo AND area = p_area AND data BETWEEN p_data_inicio AND p_data_fim;
  ELSIF v_agregacao = 'count_distinct' THEN
    SELECT count(DISTINCT valor) INTO v_resultado FROM public.dados_brutos
     WHERE tipo_id = p_dado_tipo AND area = p_area AND data BETWEEN p_data_inicio AND p_data_fim;
  ELSIF v_agregacao = 'last' THEN
    SELECT valor INTO v_resultado FROM public.dados_brutos
     WHERE tipo_id = p_dado_tipo AND area = p_area AND data BETWEEN p_data_inicio AND p_data_fim
     ORDER BY data DESC LIMIT 1;
  END IF;

  RETURN v_resultado;
END;
$$;

-- Calcular periodo anterior baseado em comparacao
CREATE OR REPLACE FUNCTION public._kpi_periodo_anterior(p_periodo_referencia text, p_comparacao text)
RETURNS text
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_year int;
  v_month int;
  v_q int;
  v_s int;
  v_w int;
BEGIN
  -- Mensal (semana_anterior, mes_anterior, ciclo_anterior, evento_anterior tratados como anterior simples)
  IF p_periodo_referencia ~ '^\d{4}-\d{2}$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_month := substring(p_periodo_referencia, 6, 2)::int;
    IF p_comparacao = 'ano_anterior' THEN
      RETURN (v_year - 1)::text || '-' || lpad(v_month::text, 2, '0');
    ELSE
      v_month := v_month - 1;
      IF v_month = 0 THEN v_month := 12; v_year := v_year - 1; END IF;
      RETURN v_year::text || '-' || lpad(v_month::text, 2, '0');
    END IF;

  ELSIF p_periodo_referencia ~ '^\d{4}-Q\d$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_q    := substring(p_periodo_referencia, 7, 1)::int;
    v_q := v_q - 1;
    IF v_q = 0 THEN v_q := 4; v_year := v_year - 1; END IF;
    RETURN v_year::text || '-Q' || v_q::text;

  ELSIF p_periodo_referencia ~ '^\d{4}-S\d$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_s := substring(p_periodo_referencia, 7, 1)::int;
    v_s := v_s - 1;
    IF v_s = 0 THEN v_s := 2; v_year := v_year - 1; END IF;
    RETURN v_year::text || '-S' || v_s::text;

  ELSIF p_periodo_referencia ~ '^\d{4}$' THEN
    RETURN ((p_periodo_referencia::int) - 1)::text;

  ELSIF p_periodo_referencia ~ '^\d{4}-W\d{2}$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_w := substring(p_periodo_referencia, 7, 2)::int;
    v_w := v_w - 1;
    IF v_w = 0 THEN v_w := 52; v_year := v_year - 1; END IF;
    RETURN v_year::text || '-W' || lpad(v_w::text, 2, '0');
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================================
-- FUNCAO PRINCIPAL: calcular_kpi(kpi_id, periodo)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calcular_kpi(
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
  v_periodo_ant text;
  v_inicio_ant date;
  v_fim_ant date;
  v_dado_tipo text;
  v_comparacao text;
  v_atual numeric;
  v_anterior numeric;
  v_numerador_tipo text;
  v_denominador_tipo text;
  v_numerador numeric;
  v_denominador numeric;
  v_janela_dias int;
  v_periodo_soma text;
  v_data_ini_soma date;
  v_data_fim_soma date;
  v_valor numeric;
  v_detalhes jsonb;
  v_year int;
  v_month int;
BEGIN
  SELECT id, area, periodicidade, tipo_calculo, formula_config
    INTO v_kpi
    FROM public.kpi_indicadores_taticos
   WHERE id = p_kpi_id;

  IF v_kpi IS NULL THEN
    RETURN jsonb_build_object('erro', 'KPI nao encontrado');
  END IF;

  -- KPI manual: nao calcula
  IF v_kpi.tipo_calculo = 'manual' THEN
    RETURN jsonb_build_object('manual', true);
  END IF;

  -- Periodo default = atual
  v_periodo := COALESCE(p_periodo_referencia,
    CASE v_kpi.periodicidade
      WHEN 'mensal'     THEN to_char(current_date, 'YYYY-MM')
      WHEN 'trimestral' THEN to_char(current_date, 'YYYY') || '-Q' || ((extract(month from current_date)::int - 1) / 3 + 1)::text
      WHEN 'semestral'  THEN to_char(current_date, 'YYYY') || '-S' || (CASE WHEN extract(month from current_date) <= 6 THEN 1 ELSE 2 END)::text
      WHEN 'anual'      THEN to_char(current_date, 'YYYY')
      WHEN 'semanal'    THEN to_char(current_date, 'YYYY') || '-W' || lpad(extract(week from current_date)::text, 2, '0')
      ELSE to_char(current_date, 'YYYY-MM')
    END);

  SELECT * INTO v_inicio, v_fim FROM public._kpi_periodo_dates(v_kpi.periodicidade, v_periodo);
  IF v_inicio IS NULL THEN
    RETURN jsonb_build_object('erro', 'Periodo invalido', 'periodo', v_periodo);
  END IF;

  -- Despachar conforme tipo_calculo
  IF v_kpi.tipo_calculo IN ('delta_pct', 'delta_abs') THEN
    v_dado_tipo  := v_kpi.formula_config->>'dado_tipo';
    v_comparacao := v_kpi.formula_config->>'comparacao';
    IF v_dado_tipo IS NULL OR v_comparacao IS NULL THEN
      RETURN jsonb_build_object('erro', 'formula_config incompleto');
    END IF;

    v_atual := public._kpi_agregar_dado(v_dado_tipo, v_kpi.area, v_inicio, v_fim);

    v_periodo_ant := public._kpi_periodo_anterior(v_periodo, v_comparacao);
    IF v_periodo_ant IS NOT NULL THEN
      SELECT * INTO v_inicio_ant, v_fim_ant FROM public._kpi_periodo_dates(v_kpi.periodicidade, v_periodo_ant);
      v_anterior := public._kpi_agregar_dado(v_dado_tipo, v_kpi.area, v_inicio_ant, v_fim_ant);
    END IF;

    IF v_kpi.tipo_calculo = 'delta_pct' THEN
      IF v_anterior IS NULL OR v_anterior = 0 THEN v_valor := NULL;
      ELSE v_valor := round(((v_atual - v_anterior) / v_anterior) * 100, 2);
      END IF;
    ELSE -- delta_abs
      v_valor := COALESCE(v_atual, 0) - COALESCE(v_anterior, 0);
    END IF;
    v_detalhes := jsonb_build_object('atual', v_atual, 'anterior', v_anterior, 'periodo_anterior', v_periodo_ant, 'tipo', v_kpi.tipo_calculo);

  ELSIF v_kpi.tipo_calculo = 'razao' THEN
    v_numerador_tipo   := v_kpi.formula_config->>'numerador';
    v_denominador_tipo := v_kpi.formula_config->>'denominador';
    IF v_numerador_tipo IS NULL OR v_denominador_tipo IS NULL THEN
      RETURN jsonb_build_object('erro', 'formula_config incompleto');
    END IF;

    v_numerador   := public._kpi_agregar_dado(v_numerador_tipo,   v_kpi.area, v_inicio, v_fim);
    v_denominador := public._kpi_agregar_dado(v_denominador_tipo, v_kpi.area, v_inicio, v_fim);

    IF v_denominador IS NULL OR v_denominador = 0 THEN v_valor := NULL;
    ELSE v_valor := round((v_numerador / v_denominador) * 100, 2);
    END IF;
    v_detalhes := jsonb_build_object('numerador', v_numerador, 'denominador', v_denominador, 'tipo', 'razao');

  ELSIF v_kpi.tipo_calculo = 'contagem_janela' THEN
    v_dado_tipo  := v_kpi.formula_config->>'dado_tipo';
    v_janela_dias := COALESCE((v_kpi.formula_config->>'janela_dias')::int, 60);
    SELECT count(*) INTO v_valor FROM public.dados_brutos
     WHERE tipo_id = v_dado_tipo AND area = v_kpi.area
       AND data >= (v_fim - v_janela_dias)
       AND data <= v_fim;
    v_detalhes := jsonb_build_object('contagem', v_valor, 'janela_dias', v_janela_dias, 'tipo', 'contagem_janela');

  ELSIF v_kpi.tipo_calculo = 'soma_periodo' THEN
    v_dado_tipo := v_kpi.formula_config->>'dado_tipo';
    v_periodo_soma := COALESCE(v_kpi.formula_config->>'periodo', 'mes');

    -- Recalcular janela conforme periodo_soma
    SELECT extract(year from current_date)::int INTO v_year;
    SELECT extract(month from current_date)::int INTO v_month;
    IF v_periodo_soma = 'mes' THEN
      v_data_ini_soma := make_date(v_year, v_month, 1);
      v_data_fim_soma := (v_data_ini_soma + interval '1 month - 1 day')::date;
    ELSIF v_periodo_soma = 'trimestre' THEN
      v_data_ini_soma := make_date(v_year, ((v_month - 1) / 3) * 3 + 1, 1);
      v_data_fim_soma := (v_data_ini_soma + interval '3 months - 1 day')::date;
    ELSIF v_periodo_soma = 'semestre' THEN
      v_data_ini_soma := make_date(v_year, CASE WHEN v_month <= 6 THEN 1 ELSE 7 END, 1);
      v_data_fim_soma := (v_data_ini_soma + interval '6 months - 1 day')::date;
    ELSIF v_periodo_soma = 'ano' THEN
      v_data_ini_soma := make_date(v_year, 1, 1);
      v_data_fim_soma := make_date(v_year, 12, 31);
    END IF;

    v_valor := public._kpi_agregar_dado(v_dado_tipo, v_kpi.area, v_data_ini_soma, v_data_fim_soma);
    v_detalhes := jsonb_build_object('valor', v_valor, 'periodo', v_periodo_soma, 'tipo', 'soma_periodo');
  END IF;

  RETURN jsonb_build_object(
    'kpi_id', v_kpi.id,
    'periodo_referencia', v_periodo,
    'valor_calculado', v_valor,
    'detalhes', v_detalhes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_kpi(text, text) TO authenticated, service_role;

-- ============================================================================
-- 5. FUNCAO recalcular_kpi: chama calcular_kpi e UPSERT no cache
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalcular_kpi(
  p_kpi_id text,
  p_periodo_referencia text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_resultado jsonb;
  v_periodo text;
  v_valor numeric;
  v_detalhes jsonb;
BEGIN
  v_resultado := public.calcular_kpi(p_kpi_id, p_periodo_referencia);

  IF v_resultado ? 'erro' OR v_resultado ? 'manual' THEN
    RETURN v_resultado;
  END IF;

  v_periodo  := v_resultado->>'periodo_referencia';
  v_valor    := (v_resultado->>'valor_calculado')::numeric;
  v_detalhes := v_resultado->'detalhes';

  INSERT INTO public.kpi_valores_calculados (kpi_id, periodo_referencia, valor_calculado, detalhes, calculado_em)
  VALUES (p_kpi_id, v_periodo, v_valor, v_detalhes, now())
  ON CONFLICT (kpi_id, periodo_referencia) DO UPDATE
    SET valor_calculado = EXCLUDED.valor_calculado,
        detalhes        = EXCLUDED.detalhes,
        calculado_em    = now();

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_kpi(text, text) TO authenticated, service_role;

-- ============================================================================
-- 6. recalcular_kpis_por_dado: dispara recalculo de todos KPIs ligados
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalcular_kpis_por_dado(
  p_tipo_id text,
  p_area text,
  p_data date
) RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_kpi RECORD;
  v_periodo_kpi text;
  v_total int := 0;
BEGIN
  FOR v_kpi IN
    SELECT id, periodicidade, tipo_calculo, formula_config
      FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND tipo_calculo != 'manual'
       AND lower(area) = lower(p_area)
       AND (
         formula_config->>'dado_tipo' = p_tipo_id OR
         formula_config->>'numerador' = p_tipo_id OR
         formula_config->>'denominador' = p_tipo_id
       )
  LOOP
    -- Determinar o periodo correspondente a data do dado
    v_periodo_kpi := CASE v_kpi.periodicidade
      WHEN 'mensal'     THEN to_char(p_data, 'YYYY-MM')
      WHEN 'trimestral' THEN to_char(p_data, 'YYYY') || '-Q' || ((extract(month from p_data)::int - 1) / 3 + 1)::text
      WHEN 'semestral'  THEN to_char(p_data, 'YYYY') || '-S' || (CASE WHEN extract(month from p_data) <= 6 THEN 1 ELSE 2 END)::text
      WHEN 'anual'      THEN to_char(p_data, 'YYYY')
      WHEN 'semanal'    THEN to_char(p_data, 'YYYY') || '-W' || lpad(extract(week from p_data)::text, 2, '0')
      ELSE to_char(p_data, 'YYYY-MM')
    END;

    PERFORM public.recalcular_kpi(v_kpi.id, v_periodo_kpi);
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_kpis_por_dado(text, text, date) TO authenticated, service_role;

-- ============================================================================
-- 7. TRIGGER em dados_brutos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_dados_brutos_recalcular_kpis()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tipo text;
  v_area text;
  v_data date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tipo := OLD.tipo_id; v_area := OLD.area; v_data := OLD.data;
  ELSE
    v_tipo := NEW.tipo_id; v_area := NEW.area; v_data := NEW.data;
  END IF;

  PERFORM public.recalcular_kpis_por_dado(v_tipo, v_area, v_data);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_dados_brutos_recalc ON public.dados_brutos;
CREATE TRIGGER tg_dados_brutos_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.dados_brutos
  FOR EACH ROW EXECUTE FUNCTION public.tg_dados_brutos_recalcular_kpis();

-- ============================================================================
-- 8. Atualizar vw_kpi_trajetoria_atual pra usar valor calculado quando aplicavel
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_kpi_trajetoria_atual AS
WITH ultimo_manual AS (
  SELECT DISTINCT ON (indicador_id)
    indicador_id, periodo_referencia, valor_realizado, data_preenchimento
  FROM public.kpi_registros
  WHERE valor_realizado IS NOT NULL
  ORDER BY indicador_id, data_preenchimento DESC
),
ultimo_calculado AS (
  SELECT DISTINCT ON (kpi_id)
    kpi_id, periodo_referencia, valor_calculado, calculado_em
  FROM public.kpi_valores_calculados
  WHERE valor_calculado IS NOT NULL
  ORDER BY kpi_id, calculado_em DESC
)
SELECT
  k.id AS kpi_id,
  k.indicador,
  k.area,
  k.periodicidade,
  k.tipo_calculo,
  t.periodo_referencia AS checkpoint_periodo,
  t.meta_valor AS checkpoint_meta,
  -- Valor: se KPI eh automatico, usa valor calculado; senao usa registro manual
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL
      THEN uc.periodo_referencia
    ELSE um.periodo_referencia
  END AS ultimo_periodo,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL
      THEN uc.valor_calculado
    ELSE um.valor_realizado
  END AS ultimo_valor,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      CASE
        WHEN t.meta_valor IS NULL THEN 'sem_meta'
        WHEN uc.valor_calculado >= t.meta_valor THEN 'no_alvo'
        WHEN uc.valor_calculado >= t.meta_valor * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN t.meta_valor IS NULL THEN 'sem_meta'
        WHEN um.valor_realizado >= t.meta_valor THEN 'no_alvo'
        WHEN um.valor_realizado >= t.meta_valor * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    ELSE 'sem_dado'
  END AS status_trajetoria,
  CASE
    WHEN t.meta_valor IS NULL OR t.meta_valor = 0 THEN NULL
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      round((uc.valor_calculado / t.meta_valor) * 100, 1)
    WHEN um.valor_realizado IS NOT NULL THEN
      round((um.valor_realizado / t.meta_valor) * 100, 1)
    ELSE NULL
  END AS percentual_meta
FROM public.kpi_indicadores_taticos k
LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
WHERE k.ativo = true;

GRANT SELECT ON public.vw_kpi_trajetoria_atual TO authenticated, service_role;

-- ============================================================================
-- CONFERENCIA APOS APLICAR
-- ============================================================================
-- 1. Tipos novos:
-- SELECT id, nome FROM tipos_dado_bruto WHERE id IN
--   ('voluntarios_inativos_3m','voluntarios_recuperados',
--    'solicitacoes_capelania_recebidas','solicitacoes_servir_alocadas',
--    'nps_lideres','nps_voluntarios','nps_geral','doacoes_qualidade');
--
-- 2. Mapeamento:
-- SELECT tipo_calculo, count(*) FROM kpi_indicadores_taticos
--  WHERE is_okr=true AND ativo=true GROUP BY tipo_calculo;
-- Esperado: ~150 com tipo_calculo NAO 'manual', ~3 ainda manual
--
-- 3. Calcular um KPI manualmente:
-- SELECT public.calcular_kpi('AMI-01');
-- (vai retornar erro/manual ou jsonb com valor calculado)
--
-- 4. Quando dado bruto entrar:
-- INSERT INTO dados_brutos (tipo_id, area, data, valor)
--   VALUES ('frequencia_culto', 'ami', '2026-05-04', 850);
-- Trigger dispara recalculo automatico.
-- SELECT * FROM kpi_valores_calculados WHERE kpi_id LIKE 'AMI%';
