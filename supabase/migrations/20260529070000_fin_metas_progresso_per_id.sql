-- ============================================================================
-- fin_metas_progresso ganha parametro p_meta_id pra permitir filtro por
-- meta específica. Antes, o RPC retornava progresso de TODAS as metas pelo
-- mesmo periodo · agora cada card de meta no Dashboard pode escolher seu
-- próprio periodo (semanal escolhe semana, mensal escolhe mês, etc).
--
-- Backward-compatible: p_meta_id default NULL, comportamento antigo
-- preservado (retorna todas as metas).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fin_metas_progresso(
  p_inicio date DEFAULT NULL,
  p_fim    date DEFAULT NULL,
  p_meta_id uuid DEFAULT NULL
)
RETURNS TABLE(
  meta_id uuid,
  tipo text,
  periodicidade text,
  descricao text,
  valor_meta numeric,
  valor_atual numeric,
  pct numeric,
  periodo_inicio date,
  periodo_fim date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_hoje date := CURRENT_DATE;
  v_semana_ini date;
  v_semana_fim date;
BEGIN
  SELECT inicio, fim INTO v_semana_ini, v_semana_fim
  FROM fin_semana_qua_ter(v_hoje);

  RETURN QUERY
  WITH metas_periodo AS (
    SELECT
      m.id,
      m.tipo,
      m.periodicidade,
      m.descricao,
      m.valor::numeric AS valor_meta,
      m.plano_contas_id,
      m.centro_custo_id,
      m.ano,
      m.mes_inicio,
      m.mes_fim,
      m.ativa,
      CASE
        WHEN p_inicio IS NOT NULL THEN p_inicio
        WHEN m.periodicidade = 'semanal' THEN v_semana_ini
        WHEN m.periodicidade = 'mensal'  THEN date_trunc('month', v_hoje)::date
        WHEN m.periodicidade = 'anual'   THEN make_date(COALESCE(m.ano, EXTRACT(YEAR FROM v_hoje)::int), 1, 1)
        ELSE date_trunc('month', v_hoje)::date
      END AS p_ini,
      CASE
        WHEN p_fim IS NOT NULL THEN p_fim
        WHEN m.periodicidade = 'semanal' THEN v_semana_fim
        WHEN m.periodicidade = 'mensal'  THEN (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date
        WHEN m.periodicidade = 'anual'   THEN make_date(COALESCE(m.ano, EXTRACT(YEAR FROM v_hoje)::int), 12, 31)
        ELSE (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date
      END AS p_end
    FROM fin_metas m
    WHERE m.ativa = true
      AND (p_meta_id IS NULL OR m.id = p_meta_id)
  ),
  agg AS (
    SELECT
      mp.id,
      CASE
        WHEN mp.tipo LIKE 'receita_%' THEN
          COALESCE(SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END), 0)
        WHEN mp.tipo LIKE 'despesa_%' THEN
          COALESCE(SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END), 0)
        WHEN mp.tipo = 'saldo_minimo' THEN
          COALESCE(SUM(CASE WHEN t.tipo='receita' THEN t.valor ELSE -t.valor END), 0)
        WHEN mp.tipo = 'meta_centro_custo' THEN
          COALESCE(SUM(t.valor) FILTER (WHERE t.centro_custo_id = mp.centro_custo_id), 0)
        ELSE 0
      END AS atual
    FROM metas_periodo mp
    LEFT JOIN fin_transacoes t
      ON t.data_competencia BETWEEN mp.p_ini AND mp.p_end
      AND t.status != 'cancelado'
      AND (mp.plano_contas_id IS NULL OR t.plano_contas_id = mp.plano_contas_id)
    GROUP BY mp.id, mp.tipo, mp.centro_custo_id
  )
  SELECT
    mp.id, mp.tipo, mp.periodicidade, mp.descricao, mp.valor_meta, a.atual,
    CASE WHEN mp.valor_meta > 0 THEN (a.atual / mp.valor_meta) * 100 ELSE 0 END,
    mp.p_ini, mp.p_end
  FROM metas_periodo mp
  JOIN agg a ON a.id = mp.id
  ORDER BY mp.periodicidade, mp.tipo, mp.descricao;
END;
$function$;

COMMENT ON FUNCTION public.fin_metas_progresso IS
  'Progresso de metas financeiras no período. Quando p_meta_id é passado, filtra só aquela meta (usado pelo filtro per-meta no dashboard).';
