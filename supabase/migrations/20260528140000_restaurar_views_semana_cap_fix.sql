-- Hotfix · views derrubadas em CASCATA pela migration 20260528120000
-- (vw_fin_semana_cultos, vw_fin_semana_resumo, vw_fin_top_contribuintes_semana)
-- Recria todas + aplica filtro classe_movimento pra excluir empréstimo/transferência
-- + ajusta receita por culto pra incluir lançamentos sem culto_slot_id (histórico importado)

CREATE OR REPLACE VIEW public.vw_fin_semana_cultos AS
SELECT
  c.id AS culto_id,
  c.data AS culto_data,
  c.service_type_id,
  st.name AS culto_nome,
  st.recurrence_day AS dia_semana,
  st.recurrence_time AS hora_culto,
  st.has_kids,
  st.has_online,
  COALESCE(c.presencial_adulto, 0) AS presencial_adulto,
  COALESCE(c.presencial_kids, 0) AS presencial_kids,
  COALESCE(c.presencial_adulto, 0) + COALESCE(c.presencial_kids, 0) AS total_presencial,
  COALESCE(c.online_pico, 0) AS online_pico,
  (
    SELECT COALESCE(SUM(t.valor), 0)
    FROM fin_transacoes t
    LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
    WHERE t.tipo = 'receita'
      AND t.status != 'cancelado'
      AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND t.data_competencia = c.data
      AND (
        (cs.service_type_slug IS NOT NULL AND cs.dia_semana = st.recurrence_day)
        OR t.culto_slot_id IS NULL
      )
  ) AS receita_total,
  (fin_semana_qua_ter(c.data)).inicio AS semana_inicio,
  (fin_semana_qua_ter(c.data)).fim AS semana_fim,
  (fin_semana_qua_ter(c.data)).label AS semana_label
FROM cultos c
JOIN vol_service_types st ON st.id = c.service_type_id
WHERE c.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.vw_fin_semana_resumo AS
WITH cultos_sem AS (
  SELECT
    (fin_semana_qua_ter(c.data)).inicio AS semana_inicio,
    (fin_semana_qua_ter(c.data)).fim AS semana_fim,
    (fin_semana_qua_ter(c.data)).label AS semana_label,
    SUM(COALESCE(c.presencial_adulto, 0) + COALESCE(c.presencial_kids, 0)) AS total_presencial,
    SUM(COALESCE(c.online_pico, 0)) AS total_online,
    COUNT(*) AS qtd_cultos
  FROM cultos c
  WHERE c.deleted_at IS NULL
  GROUP BY 1, 2, 3
),
receita_sem AS (
  SELECT
    (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
    SUM(t.valor) AS receita_total
  FROM fin_transacoes t
  WHERE t.tipo = 'receita'
    AND t.status != 'cancelado'
    AND t.classe_movimento IN ('ordinaria','extraordinaria')
  GROUP BY 1
)
SELECT
  COALESCE(c.semana_inicio, r.semana_inicio) AS semana_inicio,
  c.semana_fim,
  c.semana_label,
  COALESCE(c.qtd_cultos, 0) AS qtd_cultos,
  COALESCE(c.total_presencial, 0) AS total_presencial,
  COALESCE(c.total_online, 0) AS total_online,
  COALESCE(r.receita_total, 0) AS receita_total,
  CASE
    WHEN COALESCE(c.total_presencial, 0) > 0
    THEN COALESCE(r.receita_total, 0) / c.total_presencial
    ELSE 0
  END AS ticket_medio_presencial
FROM cultos_sem c
FULL OUTER JOIN receita_sem r ON r.semana_inicio = c.semana_inicio;

CREATE OR REPLACE VIEW public.vw_fin_top_contribuintes_semana AS
SELECT
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  t.membro_id,
  m.nome AS membro_nome,
  COUNT(*) AS qtd_doacoes,
  SUM(t.valor) AS total_doado,
  MAX(t.data_competencia) AS ultima_doacao
FROM fin_transacoes t
LEFT JOIN mem_membros m ON m.id = t.membro_id
WHERE t.tipo = 'receita'
  AND t.status != 'cancelado'
  AND t.classe_movimento IN ('ordinaria','extraordinaria')
  AND t.membro_id IS NOT NULL
GROUP BY semana_inicio, semana_fim, t.membro_id, m.nome;

-- Bonus · fin_arrecadacoes_listar virou JSONB pra escapar do cap de 1000 do PostgREST
DROP FUNCTION IF EXISTS public.fin_arrecadacoes_listar(date, date);
CREATE OR REPLACE FUNCTION public.fin_arrecadacoes_listar(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(linha ORDER BY (linha->>'data_competencia') DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', t.id,
      'data_competencia', t.data_competencia,
      'descricao', t.descricao,
      'valor', t.valor,
      'plano_contas_codigo', pc.codigo,
      'plano_contas_nome', pc.nome,
      'membro_nome', NULL,
      'membro_id', NULL,
      'status', t.status,
      'conta_id', t.conta_id
    ) AS linha
    FROM fin_transacoes t
    JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
    WHERE t.data_competencia >= p_inicio
      AND t.data_competencia <= p_fim
      AND t.status <> 'cancelado'
      AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND pc.codigo LIKE '3.01%'
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION public.fin_arrecadacoes_listar TO authenticated, service_role;

COMMIT;
