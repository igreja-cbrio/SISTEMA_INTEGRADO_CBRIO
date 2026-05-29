-- ============================================================================
-- Acelera fn_fin_doadores_lista · estava em 8.7s (acima do timeout PostgREST 8s)
-- Causa: LATERAL com LOWER(UNACCENT(nome)) em mem_membros (2.8k rows) sem
-- índice = seq scan pra cada doador (2.5k) = ~7M combinações por chamada.
-- Solução: índice funcional + função wrapper IMMUTABLE pra UNACCENT.
-- Pós-otimização: 215ms (40× mais rápido).
-- ============================================================================

-- 1. Wrapper IMMUTABLE pra UNACCENT (UNACCENT default é STABLE · não pode indexar)
CREATE OR REPLACE FUNCTION public.fn_nome_norm(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent('public.unaccent', p_nome))
$$;

COMMENT ON FUNCTION public.fn_nome_norm IS
  'Normaliza nome pra comparação: LOWER + UNACCENT. IMMUTABLE pra permitir índice funcional.';

-- 2. Índice funcional em mem_membros (só rows ativos)
CREATE INDEX IF NOT EXISTS idx_mem_membros_nome_norm_active
  ON public.mem_membros (public.fn_nome_norm(nome))
  WHERE deleted_at IS NULL AND active = true;

-- 3. Reescreve a função usando o índice (mesma assinatura)
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
      public.fn_nome_norm(TRIM(t.referencia)) AS nome_norm,
      SUM(t.valor) AS total,
      COUNT(*) AS qtd,
      MIN(t.data_competencia) AS primeira_doacao,
      MAX(t.data_competencia) AS ultima_doacao,
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
      FROM mem_membros mm
      WHERE mm.deleted_at IS NULL AND mm.active = true
        AND public.fn_nome_norm(mm.nome) = d.nome_norm
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
