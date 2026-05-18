-- Fix vw_phase_progress: total_cards e cards_bloqueados estavam contando
-- linhas duplicadas quando uma cycle_phase_task tinha múltiplas card_completions
-- no histórico (uma ativa + reaberturas anteriores).
--
-- Bug observado: Pré-briefing da Série Inabalável mostrava 1/2 (50%) no
-- relatório, mas a fase tem só 1 tarefa real (Levantar requisitos do evento,
-- Marcos Paulo, concluida).
--
-- Causa: LEFT JOIN cycle_phase_tasks cpt LEFT JOIN card_completions cc
-- multiplica rows por cpt.id quando há mais de 1 completion. COUNT(cpt.id)
-- conta cada row, inflando o total.
--
-- Fix: usar COUNT(DISTINCT cpt.id) em total_cards e cards_bloqueados.
-- cards_concluidos já contava cc.id com filtro reopened_at IS NULL — esse
-- estava OK porque é granularidade certa.

CREATE OR REPLACE VIEW vw_phase_progress AS
SELECT
  cpt.event_id,
  e.name AS event_name,
  e.date AS event_date,
  ecp.numero_fase AS phase_number,
  ecp.nome_fase,
  ecp.status AS phase_status,
  cpt.area,
  COUNT(DISTINCT cpt.id) AS total_cards,
  COUNT(cc.id) FILTER (WHERE cc.reopened_at IS NULL) AS cards_concluidos,
  COUNT(DISTINCT cpt.id) FILTER (WHERE cpt.status = 'bloqueada') AS cards_bloqueados,
  ROUND(
    COUNT(cc.id) FILTER (WHERE cc.reopened_at IS NULL)::numeric
    / NULLIF(COUNT(DISTINCT cpt.id), 0) * 100
  , 0) AS pct_concluido,
  COUNT(cc.id) FILTER (WHERE cc.file_url IS NOT NULL AND cc.reopened_at IS NULL) AS cards_com_arquivo,
  MAX(cc.completed_at) AS ultima_conclusao
FROM cycle_phase_tasks cpt
JOIN events e ON e.id = cpt.event_id
JOIN event_cycle_phases ecp ON ecp.id = cpt.event_phase_id
LEFT JOIN card_completions cc ON cc.task_id = cpt.id
GROUP BY
  cpt.event_id, e.name, e.date,
  ecp.numero_fase, ecp.nome_fase, ecp.status,
  cpt.area;
