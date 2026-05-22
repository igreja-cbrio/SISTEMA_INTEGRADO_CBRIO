-- Calendario Financeiro · view consolidada
-- 2026-05-22
-- Une 3 fontes em 1 view pro componente calendario consumir:
--   1. fin_contas_pagar (vencimentos · status_visual: vencido/urgente/pendente/pago)
--   2. fin_despesas_recorrentes (previsao de proximos vencimentos)
--   3. fin_transacoes (receitas/despesas ja realizadas)
-- Janela: mes anterior + atual + 2 meses futuros

CREATE OR REPLACE VIEW public.vw_calendario_financeiro AS
SELECT
  ('cp_' || id::text) AS id, data_vencimento AS data, 'conta_pagar' AS tipo,
  CASE WHEN status = 'pago' THEN 'pago'
       WHEN data_vencimento < CURRENT_DATE THEN 'vencido'
       WHEN data_vencimento <= CURRENT_DATE + 3 THEN 'urgente'
       ELSE 'pendente' END AS status_visual,
  descricao AS titulo, fornecedor AS subtitulo,
  -valor AS valor, status AS status_origem,
  jsonb_build_object('conta_pagar_id', id, 'status', status) AS dados
FROM fin_contas_pagar
WHERE status != 'cancelado'
  AND data_vencimento >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND data_vencimento < date_trunc('month', CURRENT_DATE) + interval '3 months'
UNION ALL
SELECT
  ('rec_' || id::text) AS id,
  COALESCE(proxima_estimada,
    CASE WHEN dia_vencimento IS NOT NULL THEN
      make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int,
                LEAST(dia_vencimento, 28))
    ELSE NULL END) AS data,
  'recorrente' AS tipo, 'previsto' AS status_visual,
  descricao AS titulo,
  COALESCE(fornecedor, 'Recorrência ' ||
    CASE cadencia_dias WHEN 7 THEN 'semanal' WHEN 14 THEN 'quinzenal'
                       WHEN 30 THEN 'mensal' WHEN 60 THEN 'bimestral'
                       WHEN 90 THEN 'trimestral' WHEN 180 THEN 'semestral'
                       WHEN 365 THEN 'anual' ELSE cadencia_dias::text || 'd' END
  ) AS subtitulo,
  -valor_medio AS valor, 'previsto' AS status_origem,
  jsonb_build_object('recorrente_id', id, 'cadencia_dias', cadencia_dias) AS dados
FROM fin_despesas_recorrentes
WHERE ativa = true AND confirmada = true
  AND COALESCE(proxima_estimada, CURRENT_DATE) >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND COALESCE(proxima_estimada, CURRENT_DATE) < date_trunc('month', CURRENT_DATE) + interval '3 months'
UNION ALL
SELECT
  ('tx_' || id::text) AS id, data_competencia AS data,
  CASE tipo WHEN 'receita' THEN 'receita_realizada' ELSE 'despesa_realizada' END AS tipo,
  'realizado' AS status_visual,
  descricao AS titulo, NULL::text AS subtitulo,
  CASE tipo WHEN 'receita' THEN valor ELSE -valor END AS valor,
  status AS status_origem,
  jsonb_build_object('transacao_id', id) AS dados
FROM fin_transacoes
WHERE status != 'cancelado'
  AND data_competencia >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND data_competencia < date_trunc('month', CURRENT_DATE) + interval '3 months';

GRANT SELECT ON public.vw_calendario_financeiro TO authenticated, service_role;

COMMIT;
