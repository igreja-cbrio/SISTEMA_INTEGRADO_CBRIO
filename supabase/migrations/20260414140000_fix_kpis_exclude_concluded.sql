-- Corrige vw_pmo_kpis: tarefas de eventos concluidos nao devem contar
-- como abertas ou atrasadas no dashboard
CREATE OR REPLACE VIEW vw_pmo_kpis AS
SELECT
  (SELECT count(*) FROM events) AS total_events,
  (SELECT count(*) FROM events WHERE status = 'no-prazo') AS events_on_track,
  (SELECT count(*) FROM events WHERE status IN ('atencao','em-risco')) AS events_at_risk,
  (SELECT count(*) FROM events WHERE status = 'atrasado') AS events_overdue,
  (SELECT count(*) FROM events WHERE date >= CURRENT_DATE AND date <= CURRENT_DATE + interval '7 days') AS events_next_7d,

  -- tasks_open: exclui tarefas de eventos concluidos
  (
    (SELECT count(*) FROM event_tasks et
     JOIN events e ON e.id = et.event_id
     WHERE et.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido')
    +
    (SELECT count(*) FROM cycle_phase_tasks cpt
     JOIN events e ON e.id = cpt.event_id
     WHERE cpt.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido')
  ) AS tasks_open,

  -- tasks_overdue: exclui tarefas de eventos concluidos
  (
    (SELECT count(*) FROM event_tasks et
     JOIN events e ON e.id = et.event_id
     WHERE et.deadline < CURRENT_DATE
       AND et.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido')
    +
    (SELECT count(*) FROM cycle_phase_tasks cpt
     JOIN events e ON e.id = cpt.event_id
     WHERE cpt.prazo < CURRENT_DATE
       AND cpt.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido')
  ) AS tasks_overdue,

  (SELECT count(*) FROM event_risks WHERE status NOT IN ('mitigado','fechado')) AS risks_open,
  (SELECT count(*) FROM events WHERE responsible IS NULL OR responsible = '') AS events_no_owner,
  (SELECT COALESCE(sum(budget_planned),0) FROM events) AS budget_total,
  (SELECT COALESCE(sum(budget_spent),0) FROM events) AS budget_spent;
