-- ============================================================================
-- fn_fin_doadores_lista · lista doadores agregados do ano com best-effort
-- matching pra mem_membros (via membro_id direto OU nome normalizado).
--
-- Alimenta o drilldown do card "Concentração de doadores" no Dashboard
-- Financeiro Semanal. Quando o doador tem `mem_membros.id` matched, o
-- frontend abre a ficha 360 completa do membro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_fin_doadores_lista(
  p_ano integer DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano int := COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  v_total_geral numeric;
  v_qtd_total int;
  v_items jsonb;
BEGIN
  WITH doadores AS (
    SELECT
      TRIM(t.referencia) AS nome_referencia,
      LOWER(UNACCENT(TRIM(t.referencia))) AS nome_norm,
      SUM(t.valor) AS total,
      COUNT(*) AS qtd,
      MIN(t.data_competencia) AS primeira_doacao,
      MAX(t.data_competencia) AS ultima_doacao,
      BOOL_OR(t.membro_id IS NOT NULL) AS tem_link_direto,
      (ARRAY_AGG(t.membro_id) FILTER (WHERE t.membro_id IS NOT NULL))[1] AS membro_id_direto
    FROM fin_transacoes t
    JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
    WHERE t.tipo = 'receita'
      AND t.status <> 'cancelado'
      AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND pc.codigo LIKE '3.01%'
      AND EXTRACT(YEAR FROM t.data_competencia) = v_ano
      AND t.referencia IS NOT NULL
      AND TRIM(t.referencia) <> ''
    GROUP BY 1, 2
  ),
  ranked AS (
    SELECT d.*,
      COALESCE(d.membro_id_direto, m.id) AS membro_id,
      m.nome AS membro_nome,
      m.foto_url AS membro_foto,
      m.status AS membro_status,
      CASE
        WHEN d.membro_id_direto IS NOT NULL THEN 'fk'
        WHEN m.id IS NOT NULL THEN 'nome'
        ELSE NULL
      END AS match_via,
      SUM(d.total) OVER () AS total_geral,
      COUNT(*) OVER () AS qtd_total,
      ROW_NUMBER() OVER (ORDER BY d.total DESC, d.nome_referencia) AS posicao
    FROM doadores d
    LEFT JOIN LATERAL (
      SELECT id, nome, foto_url, status
      FROM mem_membros
      WHERE deleted_at IS NULL
        AND active = true
        AND LOWER(UNACCENT(nome)) = d.nome_norm
      LIMIT 1
    ) m ON d.membro_id_direto IS NULL
  )
  SELECT
    MAX(total_geral),
    MAX(qtd_total),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'posicao', posicao,
        'nome', nome_referencia,
        'total', ROUND(total::numeric, 2),
        'qtd', qtd,
        'primeira_doacao', primeira_doacao,
        'ultima_doacao', ultima_doacao,
        'pct_geral', ROUND((total / NULLIF(total_geral, 0) * 100)::numeric, 2),
        'membro_id', membro_id,
        'membro_nome', membro_nome,
        'membro_foto', membro_foto,
        'membro_status', membro_status,
        'match_via', match_via
      ) ORDER BY total DESC, nome_referencia
    ) FILTER (WHERE posicao > p_offset AND posicao <= p_offset + p_limit), '[]'::jsonb)
  INTO v_total_geral, v_qtd_total, v_items
  FROM ranked;

  RETURN jsonb_build_object(
    'ano', v_ano,
    'total_geral', COALESCE(v_total_geral, 0),
    'qtd_total', COALESCE(v_qtd_total, 0),
    'limit', p_limit,
    'offset', p_offset,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.fn_fin_doadores_lista IS
  'Lista paginada de doadores do ano (PDC 3.01%) com best-effort matching pra mem_membros via FK direta ou nome normalizado. Alimenta drilldown da concentração de doadores no dashboard financeiro.';

-- ============================================================================
-- fn_fin_transacoes_por_referencia · lista lançamentos de um doador
-- não-vinculado (sem mem_membros.id matched). Usado pelo drawer da ficha
-- quando o doador ainda não foi linkado a um cadastro de membresia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_fin_transacoes_por_referencia(
  p_nome text,
  p_ano integer DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano int := COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  v_nome_norm text := LOWER(UNACCENT(TRIM(p_nome)));
  v_items jsonb;
  v_total numeric;
  v_qtd int;
BEGIN
  WITH lancs AS (
    SELECT
      t.id,
      t.data_competencia,
      t.valor,
      t.descricao,
      pc.codigo AS pdc_codigo,
      pc.nome AS pdc_nome
    FROM fin_transacoes t
    JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
    WHERE t.tipo = 'receita'
      AND t.status <> 'cancelado'
      AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND LOWER(UNACCENT(TRIM(t.referencia))) = v_nome_norm
      AND EXTRACT(YEAR FROM t.data_competencia) = v_ano
    ORDER BY t.data_competencia DESC
    LIMIT p_limit
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'data', data_competencia,
        'valor', ROUND(valor::numeric, 2),
        'descricao', descricao,
        'pdc_codigo', pdc_codigo,
        'pdc_nome', pdc_nome
      ) ORDER BY data_competencia DESC
    ), '[]'::jsonb),
    COALESCE(SUM(valor), 0),
    COUNT(*)
  INTO v_items, v_total, v_qtd
  FROM lancs;

  RETURN jsonb_build_object(
    'nome', p_nome,
    'ano', v_ano,
    'total', v_total,
    'qtd', v_qtd,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.fn_fin_transacoes_por_referencia IS
  'Retorna lançamentos de uma referência (nome do pagador) no ano. Usado pra mostrar histórico de doação de doador não-vinculado a mem_membros.';
