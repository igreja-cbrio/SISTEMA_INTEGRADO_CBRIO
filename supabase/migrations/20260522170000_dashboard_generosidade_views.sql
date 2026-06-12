-- Dashboard de Generosidade · views consolidadas (3 fontes potenciais)
-- 2026-05-22 · PR 2/3 do pacote financeiro
-- Fontes que sao agregadas:
--   - mem_contribuicoes (oficial · vincula membro)
--   - fin_transacoes (lancamentos classificados)
--   - fin_pix_detalhe (PIX importado com nome do pagador)

-- 1. View unificada das doacoes
CREATE OR REPLACE VIEW public.vw_doacoes_unificada AS
SELECT
  mc.id, mc.data, mc.valor, mc.tipo, mc.forma_pagamento, mc.membro_id,
  mm.nome AS pagador_nome, NULL::text AS pagador_documento,
  mc.campanha, mc.origem, 'mem_contribuicoes' AS fonte
FROM mem_contribuicoes mc
LEFT JOIN mem_membros mm ON mm.id = mc.membro_id
WHERE mc.deleted_at IS NULL
UNION ALL
SELECT
  ft.id, ft.data_competencia AS data, ft.valor,
  CASE
    WHEN pc.codigo LIKE '3.01.01%' THEN 'dizimo'
    WHEN pc.codigo LIKE '3.01.02%' THEN 'oferta'
    ELSE 'outro'
  END AS tipo,
  NULL::text AS forma_pagamento, NULL::uuid AS membro_id,
  NULL::text AS pagador_nome, NULL::text AS pagador_documento,
  NULL::text AS campanha, 'fin_transacoes' AS origem, 'fin_transacoes' AS fonte
FROM fin_transacoes ft
LEFT JOIN fin_plano_contas pc ON pc.id = ft.plano_contas_id
WHERE ft.tipo = 'receita' AND ft.status != 'cancelado'
  AND (pc.codigo LIKE '3.01%' OR pc.id IS NULL)
UNION ALL
SELECT
  pd.id, pd.data, pd.valor,
  CASE
    WHEN UPPER(pd.identificador_pagamento) LIKE '%DIZIMO%' THEN 'dizimo'
    WHEN UPPER(pd.identificador_pagamento) LIKE '%OFERTA%' THEN 'oferta'
    ELSE 'doacao_pix'
  END AS tipo,
  'pix' AS forma_pagamento, NULL::uuid AS membro_id,
  pd.pagador_nome, pd.pagador_documento,
  pd.identificador_pagamento AS campanha, 'pix' AS origem, 'fin_pix_detalhe' AS fonte
FROM fin_pix_detalhe pd
WHERE pd.tipo = 'credit';

-- 2. Overview mensal · 12 meses
CREATE OR REPLACE VIEW public.vw_doacoes_mensal AS
WITH meses AS (
  SELECT (date_trunc('month', CURRENT_DATE) - (n || ' month')::interval)::date AS mes
    FROM generate_series(0, 11) n
)
SELECT
  m.mes, TO_CHAR(m.mes, 'TMMon/YY') AS mes_label,
  COALESCE(SUM(d.valor), 0) AS total,
  COALESCE(SUM(d.valor) FILTER (WHERE d.tipo = 'dizimo'), 0) AS dizimo,
  COALESCE(SUM(d.valor) FILTER (WHERE d.tipo = 'oferta'), 0) AS oferta,
  COALESCE(SUM(d.valor) FILTER (WHERE d.tipo NOT IN ('dizimo', 'oferta')), 0) AS outras,
  COUNT(DISTINCT d.id) AS qtd_doacoes,
  COUNT(DISTINCT COALESCE(d.membro_id::text, d.pagador_documento, d.pagador_nome)) FILTER (WHERE d.id IS NOT NULL) AS qtd_doadores_unicos
  FROM meses m
  LEFT JOIN vw_doacoes_unificada d ON date_trunc('month', d.data) = m.mes
 GROUP BY m.mes ORDER BY m.mes;

-- 3. Top doadores anonimos · oportunidade de cadastrar como membro
CREATE OR REPLACE VIEW public.vw_doadores_anonimos_top AS
SELECT
  COALESCE(pagador_documento, pagador_nome) AS identificador,
  pagador_nome AS nome, pagador_documento AS documento,
  COUNT(*) AS qtd_doacoes, SUM(valor) AS total,
  MIN(data) AS primeira_doacao, MAX(data) AS ultima_doacao
  FROM vw_doacoes_unificada
 WHERE membro_id IS NULL AND pagador_nome IS NOT NULL
   AND data >= CURRENT_DATE - interval '90 days'
 GROUP BY pagador_nome, pagador_documento
HAVING COUNT(*) >= 2
 ORDER BY total DESC LIMIT 30;

-- 4. Membros que pararam · acao pastoral
CREATE OR REPLACE VIEW public.vw_doadores_pararam AS
SELECT
  d.membro_id, mm.nome, mm.telefone, mm.email,
  MAX(d.data) AS ultima_doacao,
  COUNT(*) AS doacoes_total, SUM(d.valor) AS valor_total,
  CURRENT_DATE - MAX(d.data) AS dias_inativo
  FROM vw_doacoes_unificada d
  JOIN mem_membros mm ON mm.id = d.membro_id
 WHERE d.membro_id IS NOT NULL AND mm.deleted_at IS NULL
 GROUP BY d.membro_id, mm.nome, mm.telefone, mm.email
HAVING MAX(d.data) < CURRENT_DATE - interval '60 days'
   AND MAX(d.data) >= CURRENT_DATE - interval '365 days'
   AND COUNT(*) >= 3
 ORDER BY MAX(d.data) DESC LIMIT 100;

GRANT SELECT ON public.vw_doacoes_unificada     TO authenticated, service_role;
GRANT SELECT ON public.vw_doacoes_mensal        TO authenticated, service_role;
GRANT SELECT ON public.vw_doadores_anonimos_top TO authenticated, service_role;
GRANT SELECT ON public.vw_doadores_pararam      TO authenticated, service_role;

COMMIT;
