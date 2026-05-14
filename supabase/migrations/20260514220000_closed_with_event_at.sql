-- Distingue tarefa "concluída de verdade" (responsável marcou) de
-- "fechada porque o evento acabou" (cascade automático no finalize).
--
-- Antes desta migration, tarefas em aberto continuavam aparecendo como
-- atrasadas/pendentes mesmo depois que o evento delas terminou. Marcos
-- pediu que essas tarefas saíssem dos relatórios diários mas não fossem
-- esquecidas — o relatório do evento finalizado destaca o que ficou em
-- aberto.
--
-- Política: status da tarefa NÃO muda no finalize. Continua pendente/
-- em-andamento/concluida como o responsável deixou. Mas se o evento for
-- finalizado, marca-se closed_with_event_at = NOW() pra:
--   - filtrar das listas de "pendentes/atrasadas"
--   - contar separadamente em "finalizadas com evento"
--   - alimentar prompt do Haiku no relatório

ALTER TABLE event_tasks
  ADD COLUMN IF NOT EXISTS closed_with_event_at TIMESTAMPTZ;

ALTER TABLE cycle_phase_tasks
  ADD COLUMN IF NOT EXISTS closed_with_event_at TIMESTAMPTZ;

COMMENT ON COLUMN event_tasks.closed_with_event_at IS
  'Timestamp em que o evento associado foi finalizado, marcando a tarefa como "fechada com evento" mesmo que status não seja concluida. NULL = ainda relevante OU concluída pelo responsável.';
COMMENT ON COLUMN cycle_phase_tasks.closed_with_event_at IS
  'Idem event_tasks.closed_with_event_at.';

-- Índices parciais (só linhas marcadas, pequeno custo)
CREATE INDEX IF NOT EXISTS idx_event_tasks_closed_with_event
  ON event_tasks (event_id, closed_with_event_at)
  WHERE closed_with_event_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cycle_phase_tasks_closed_with_event
  ON cycle_phase_tasks (event_id, closed_with_event_at)
  WHERE closed_with_event_at IS NOT NULL;

-- ── Backfill ──
-- Pra eventos já concluídos, marca tarefas em aberto (pendente/em-andamento/
-- bloqueada) com o updated_at do evento como aproximação do "momento do
-- finalize". Tarefas que estavam 'concluida' NÃO são tocadas — não há jeito
-- confiável de distinguir entre "concluída pelo responsável antes do finalize"
-- e "cascade automática no finalize" retroativamente (a cascade nem rodava
-- antes). Conservador: assume que toda concluida atual é legítima.

UPDATE event_tasks et
   SET closed_with_event_at = e.updated_at
  FROM events e
 WHERE e.id = et.event_id
   AND e.status = 'concluido'
   AND et.closed_with_event_at IS NULL
   AND et.status NOT IN ('concluida', 'concluido');

UPDATE cycle_phase_tasks cpt
   SET closed_with_event_at = e.updated_at
  FROM events e
 WHERE e.id = cpt.event_id
   AND e.status = 'concluido'
   AND cpt.closed_with_event_at IS NULL
   AND cpt.status NOT IN ('concluida', 'concluido');

-- ── Update vw_pmo_kpis pra reconhecer também essa coluna ──
-- A view antiga já excluía via "e.status <> 'concluido'" (filtro pelo evento).
-- Agora adiciona belt-and-suspenders: também ignora se closed_with_event_at
-- estiver setado. Isso cobre o caso de tarefas criadas em eventos finalizados
-- que por algum motivo não foram marcadas (improvável mas defensivo).

CREATE OR REPLACE VIEW vw_pmo_kpis AS
SELECT
  (SELECT count(*) FROM events) AS total_events,
  (SELECT count(*) FROM events WHERE status = 'no-prazo') AS events_on_track,
  (SELECT count(*) FROM events WHERE status IN ('atencao','em-risco')) AS events_at_risk,
  (SELECT count(*) FROM events WHERE status = 'atrasado') AS events_overdue,
  (SELECT count(*) FROM events WHERE date >= CURRENT_DATE AND date <= CURRENT_DATE + interval '7 days') AS events_next_7d,

  -- tasks_open: exclui tarefas de eventos concluídos OU marcadas closed_with_event_at
  (
    (SELECT count(*) FROM event_tasks et
     JOIN events e ON e.id = et.event_id
     WHERE et.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido'
       AND et.closed_with_event_at IS NULL)
    +
    (SELECT count(*) FROM cycle_phase_tasks cpt
     JOIN events e ON e.id = cpt.event_id
     WHERE cpt.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido'
       AND cpt.closed_with_event_at IS NULL)
  ) AS tasks_open,

  -- tasks_overdue: idem
  (
    (SELECT count(*) FROM event_tasks et
     JOIN events e ON e.id = et.event_id
     WHERE et.deadline < CURRENT_DATE
       AND et.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido'
       AND et.closed_with_event_at IS NULL)
    +
    (SELECT count(*) FROM cycle_phase_tasks cpt
     JOIN events e ON e.id = cpt.event_id
     WHERE cpt.prazo < CURRENT_DATE
       AND cpt.status NOT IN ('concluida','concluido')
       AND e.status <> 'concluido'
       AND cpt.closed_with_event_at IS NULL)
  ) AS tasks_overdue,

  -- NOVO: tasks_closed_with_event — contagem pro bucket "finalizadas com evento"
  (
    (SELECT count(*) FROM event_tasks WHERE closed_with_event_at IS NOT NULL AND status NOT IN ('concluida','concluido'))
    +
    (SELECT count(*) FROM cycle_phase_tasks WHERE closed_with_event_at IS NOT NULL AND status NOT IN ('concluida','concluido'))
  ) AS tasks_closed_with_event,

  (SELECT count(*) FROM event_risks WHERE status NOT IN ('mitigado','fechado')) AS risks_open,
  (SELECT count(*) FROM events WHERE responsible IS NULL OR responsible = '') AS events_no_owner,
  (SELECT COALESCE(sum(budget_planned),0) FROM events) AS budget_total,
  (SELECT COALESCE(sum(budget_spent),0) FROM events) AS budget_spent;
