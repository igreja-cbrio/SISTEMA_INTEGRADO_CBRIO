-- Fix vw_workload: excluir tarefas de eventos finalizados.
--
-- Bug reportado: Home do módulo de Eventos (widget "Carga de Trabalho")
-- mostrava pessoas com tarefas em vermelho (atrasadas) que pertenciam a
-- eventos JÁ FINALIZADOS. A PR #420 (closed_with_event_at) cobriu
-- vw_pmo_kpis e /api/tasks/all, mas vw_workload ficou de fora porque a
-- definição não estava no repo (mora só no Supabase produção).
--
-- Esta migration atualiza vw_workload com 2 filtros:
--   1. Tarefa NÃO está marcada closed_with_event_at IS NOT NULL
--      (cascade quando o evento foi finalizado, status real preservado)
--   2. Evento associado NÃO está concluido (belt-and-suspenders pra cobrir
--      casos legados sem closed_with_event_at — o backfill da PR #420
--      cuidou disso, mas mantenho redundante por segurança)
--
-- Mantém ordenação atrasadas DESC + total_tasks DESC como antes.

DROP VIEW IF EXISTS vw_workload;
CREATE OR REPLACE VIEW vw_workload AS
SELECT
  COALESCE(responsible, 'Sem responsável') AS responsible,
  COUNT(*)                                 AS total_tasks,
  COUNT(*) FILTER (
    WHERE deadline IS NOT NULL
      AND deadline < CURRENT_DATE
  ) AS atrasadas
FROM (
  -- event_tasks (kanban simples)
  SELECT et.responsible, et.deadline
    FROM event_tasks et
    JOIN events e ON e.id = et.event_id
   WHERE et.status NOT IN ('concluida', 'concluido')
     AND et.closed_with_event_at IS NULL
     AND e.status <> 'concluido'

  UNION ALL

  -- cycle_phase_tasks (ciclo criativo)
  SELECT cpt.responsavel_nome AS responsible,
         cpt.prazo            AS deadline
    FROM cycle_phase_tasks cpt
    JOIN events e ON e.id = cpt.event_id
   WHERE cpt.status NOT IN ('concluida', 'concluido')
     AND cpt.closed_with_event_at IS NULL
     AND e.status <> 'concluido'
) open_tasks
GROUP BY COALESCE(responsible, 'Sem responsável')
ORDER BY atrasadas DESC, total_tasks DESC;
