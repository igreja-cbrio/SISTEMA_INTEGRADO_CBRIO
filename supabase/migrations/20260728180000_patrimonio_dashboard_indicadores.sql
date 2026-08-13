-- Indicadores novos do Dashboard de Patrimônio (pedido do usuário 2026-07-28).
--
-- ⚠️ NOTA IMPORTANTE (achado de auditoria): as tabelas pat_bens/pat_movimentacoes/
-- pat_categorias/pat_localizacoes/pat_inventarios e a função pat_dashboard_stats()
-- já existentes em produção NUNCA foram versionadas em migration (foram criadas
-- direto no SQL Editor do Supabase) — mesmo padrão de drift já documentado no
-- CLAUDE.md pro caso cui_atendimentos. Por isso esta migration cria uma função
-- NOVA (pat_dashboard_indicadores), sem tocar em pat_dashboard_stats — evita
-- sobrescrever silenciosamente uma lógica que não está no repositório.
--
-- Colunas usadas abaixo (confirmadas por uso extensivo em backend/routes/
-- patrimonio.js, não por migration — mesma ressalva de drift):
--   pat_bens: id, nome, categoria_id, localizacao_id, valor_aquisicao, status,
--             created_at
--   pat_movimentacoes: id, bem_id, tipo, data_movimentacao

CREATE OR REPLACE FUNCTION public.pat_dashboard_indicadores()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_bens', (SELECT count(*) FROM pat_bens),
    'sem_localizacao', (SELECT count(*) FROM pat_bens WHERE localizacao_id IS NULL),
    'sem_categoria', (SELECT count(*) FROM pat_bens WHERE categoria_id IS NULL),
    'sem_valor', (SELECT count(*) FROM pat_bens WHERE valor_aquisicao IS NULL OR valor_aquisicao = 0),

    -- Bens ativos de valor alto (top 20% por valor, ou ao menos com valor > 0)
    -- sem NENHUMA movimentação nos últimos 365 dias (ou nunca movimentados) —
    -- melhor proxy hoje pra "bem esquecido"/risco de extravio não detectado.
    'alto_valor_sem_movimentacao', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT b.id, b.nome, b.valor_aquisicao,
               l.nome AS localizacao_nome,
               m.ultima_mov,
               CASE WHEN m.ultima_mov IS NULL THEN NULL
                    ELSE (now()::date - m.ultima_mov::date) END AS dias_sem_mover
        FROM pat_bens b
        LEFT JOIN pat_localizacoes l ON l.id = b.localizacao_id
        LEFT JOIN (
          SELECT bem_id, max(data_movimentacao) AS ultima_mov
          FROM pat_movimentacoes GROUP BY bem_id
        ) m ON m.bem_id = b.id
        WHERE b.status = 'ativo'
          AND b.valor_aquisicao IS NOT NULL AND b.valor_aquisicao > 0
          AND (m.ultima_mov IS NULL OR m.ultima_mov < now() - interval '365 days')
        ORDER BY b.valor_aquisicao DESC
        LIMIT 15
      ) t
    ),

    -- Tendência mensal de baixas (últimos 12 meses), pra diretoria acompanhar
    -- se perda patrimonial está subindo.
    'tendencia_baixas_mensal', (
      SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.mes), '[]'::jsonb) FROM (
        SELECT to_char(date_trunc('month', data_movimentacao), 'YYYY-MM') AS mes,
               count(*) AS total
        FROM pat_movimentacoes
        WHERE tipo = 'baixa' AND data_movimentacao >= now() - interval '12 months'
        GROUP BY 1
      ) t
    ),

    -- Bens em manutenção há mais de 30 dias desde a última movimentação do
    -- tipo 'manutencao' (ou desde sempre, se nunca teve uma) — cobra o
    -- responsável/fornecedor.
    'manutencao_atrasada', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT b.id, b.nome, l.nome AS localizacao_nome, m.ultima_mov,
               CASE WHEN m.ultima_mov IS NULL THEN NULL
                    ELSE (now()::date - m.ultima_mov::date) END AS dias_em_manutencao
        FROM pat_bens b
        LEFT JOIN pat_localizacoes l ON l.id = b.localizacao_id
        LEFT JOIN LATERAL (
          SELECT max(data_movimentacao) AS ultima_mov
          FROM pat_movimentacoes
          WHERE bem_id = b.id AND tipo = 'manutencao'
        ) m ON true
        WHERE b.status = 'manutencao'
          AND (m.ultima_mov IS NULL OR m.ultima_mov < now() - interval '30 days')
        ORDER BY dias_em_manutencao DESC NULLS LAST
        LIMIT 15
      ) t
    )
  );
$$;

COMMENT ON FUNCTION public.pat_dashboard_indicadores() IS
  'Indicadores adicionais do Dashboard de Patrimônio (saneamento de cadastro, '
  'risco de extravio, manutenção atrasada). Não substitui pat_dashboard_stats() — '
  'função separada de propósito (drift de schema não-versionado · CLAUDE.md).';

GRANT EXECUTE ON FUNCTION public.pat_dashboard_indicadores() TO authenticated;
