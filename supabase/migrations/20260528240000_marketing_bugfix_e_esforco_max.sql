-- ============================================================================
-- MIGRATION · Marketing · Bugfix funcoes faltantes + esforco_max (Spec 016)
-- ============================================================================
-- 1. Recria fn_marketing_segunda_da_semana (faltava em prod · Spec 005)
-- 2. Recria fn_marketing_calcular_capacidade_semana (faltava em prod · Spec 005)
-- 3. Recria fn_marketing_estimar_prazo (faltava em prod · Spec 005) ja com esforco_max
-- 4. Renomeia coluna esforco_medio_h -> esforco_max_h (proposta A · Marcos 2026-05-28)
--
-- Motivo da troca:
--   medio = historico calibrado · sem alerta de atraso individual
--   max   = SLA acordado · "story precisa ficar pronto em X" · detecta enrolacao
--
-- Idempotente · CREATE OR REPLACE + ALTER IF EXISTS.
-- ============================================================================

-- 1. Renomeia coluna (esforco_medio_h -> esforco_max_h)
ALTER TABLE public.marketing_etiquetas_tipo
  RENAME COLUMN esforco_medio_h TO esforco_max_h;

COMMENT ON COLUMN public.marketing_etiquetas_tipo.esforco_max_h IS
  'Tempo MAXIMO acordado pra entregar esse tipo · SLA interno. Usado pra: (a) estimativa preliminar pessimista (b) capacidade alocada conservadora (c) badge atrasado individual (>esforco_max * 1.5). NULL = tipo nao calibrado.';

-- 2. fn_marketing_segunda_da_semana (helper)
CREATE OR REPLACE FUNCTION public.fn_marketing_segunda_da_semana(p_data date)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (p_data - ((EXTRACT(ISODOW FROM p_data) - 1) * INTERVAL '1 day'))::date
$$;

-- 3. fn_marketing_calcular_capacidade_semana
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
           SUM(COALESCE(t.esforco_max_h, 0)) AS horas_alocadas
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

GRANT EXECUTE ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) TO authenticated, service_role;

-- 4. fn_marketing_estimar_prazo (usa esforco_max_h)
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
  SELECT esforco_max_h INTO v_esforco
    FROM public.marketing_etiquetas_tipo
   WHERE id = p_tipo_id AND ativo = true;

  IF v_esforco IS NULL THEN
    v_data_sugerida := COALESCE(p_data_alvo, CURRENT_DATE + INTERVAL '5 days');
    RETURN jsonb_build_object(
      'data_sugerida', v_data_sugerida,
      'dias_uteis', NULL,
      'esforco_h', NULL,
      'capacidade_dia', NULL,
      'observacao', 'Tipo ainda sem SLA definido · Pedro confirma o prazo real depois.'
    );
  END IF;

  SELECT GREATEST(SUM(horas_livres), 0) / 5 INTO v_capacidade_dia
    FROM public.fn_marketing_calcular_capacidade_semana(CURRENT_DATE);

  IF v_capacidade_dia IS NULL OR v_capacidade_dia <= 0 THEN
    v_dias_necessarios := 10;
    v_observacao := 'Equipe sem capacidade livre nesta semana · prazo realista em ~2 semanas.';
  ELSE
    v_dias_necessarios := GREATEST(1, CEIL(v_esforco / (v_capacidade_dia * v_fator))::integer);
    v_observacao := 'Estimativa preliminar pessimista (SLA maximo). Pedro confirma o prazo real depois.';
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

GRANT EXECUTE ON FUNCTION public.fn_marketing_estimar_prazo(uuid, date) TO authenticated, service_role;
