-- Dashboard semanal financeiro × frequencia
-- View consolidada que junta receita + frequencia + ticket medio por culto
-- Idempotente

-- ============================================================
-- View · culto da semana qua-ter com receita + frequencia
-- ============================================================
-- Cada linha: 1 culto da semana com:
--   - frequencia presencial (adulto + kids)
--   - frequencia online (pico)
--   - receita PIX agregada (matched pelo culto_slot via fin_transacoes)
--   - ticket medio = receita / presencial total
CREATE OR REPLACE VIEW vw_fin_semana_cultos AS
SELECT
  c.id AS culto_id,
  c.data AS culto_data,
  c.service_type_id,
  st.name AS culto_nome,
  st.recurrence_day AS dia_semana,
  st.recurrence_time AS hora_culto,
  st.has_kids,
  st.has_online,
  -- Frequencia
  COALESCE(c.presencial_adulto, 0) AS presencial_adulto,
  COALESCE(c.presencial_kids, 0) AS presencial_kids,
  COALESCE(c.presencial_adulto, 0) + COALESCE(c.presencial_kids, 0) AS total_presencial,
  COALESCE(c.online_pico, 0) AS online_pico,
  -- Receita classificada pra esse culto (via culto_slot_id ligado em fin_transacoes)
  (
    SELECT COALESCE(SUM(t.valor), 0)
    FROM fin_transacoes t
    LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
    WHERE t.tipo = 'receita'
      AND t.status != 'cancelado'
      AND t.data_competencia = c.data
      AND cs.service_type_slug IS NOT NULL
      AND (cs.dia_semana = st.recurrence_day)
  ) AS receita_total,
  -- Identificador da semana qua-ter
  (fin_semana_qua_ter(c.data)).inicio AS semana_inicio,
  (fin_semana_qua_ter(c.data)).fim AS semana_fim,
  (fin_semana_qua_ter(c.data)).label AS semana_label
FROM cultos c
JOIN vol_service_types st ON st.id = c.service_type_id
WHERE c.deleted_at IS NULL;

-- ============================================================
-- View · resumo da semana qua-ter com totalizadores
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_semana_resumo AS
SELECT
  semana_inicio,
  semana_fim,
  semana_label,
  COUNT(*) FILTER (WHERE receita_total > 0 OR total_presencial > 0) AS qtd_cultos,
  SUM(total_presencial) AS total_presencial,
  SUM(online_pico) AS total_online,
  SUM(receita_total) AS receita_total,
  CASE
    WHEN SUM(total_presencial) > 0
    THEN SUM(receita_total) / SUM(total_presencial)
    ELSE 0
  END AS ticket_medio_presencial
FROM vw_fin_semana_cultos
GROUP BY semana_inicio, semana_fim, semana_label;

-- ============================================================
-- View · top contribuintes da semana (membros + valor)
-- ============================================================
-- Sem RLS · view apenas leitura · auth no backend
CREATE OR REPLACE VIEW vw_fin_top_contribuintes_semana AS
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
  AND t.membro_id IS NOT NULL
GROUP BY semana_inicio, semana_fim, t.membro_id, m.nome;

COMMIT;
