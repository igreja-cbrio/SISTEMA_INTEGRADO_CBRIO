-- Backfill: cria card_completion retroativo pra tarefas de ciclo que estão
-- com status='concluida' mas NÃO têm completion ativa.
--
-- Bug histórico: o dropdown de status no kanban (PATCH /tasks/ciclo/.../status)
-- só atualizava cycle_phase_tasks.status. A view vw_phase_progress conta
-- card_completions (não status), então o relatório IA via Haiku mostrava 0/N
-- mesmo com fases visualmente "concluídas". Inabalável tem várias.
--
-- O fix em código (tasks.js) garante que daqui pra frente todo dropdown cria
-- completion. Este backfill cuida do histórico.
--
-- Conservador: usa NULL em completed_by (não inventamos quem foi) e
-- completed_at = updated_at da tarefa (timestamp do banco, não da UI).
-- Marca reason='backfill_from_status_2026-05-18' pra auditoria.

INSERT INTO card_completions (
  task_id, event_id, event_phase_id, phase_number,
  area, card_titulo,
  observacao,
  completed_at, completed_by, completed_by_name
)
SELECT
  cpt.id,
  cpt.event_id,
  cpt.event_phase_id,
  COALESCE(ecp.numero_fase, 0),
  COALESCE(cpt.area, ''),
  COALESCE(cpt.titulo, ''),
  '[backfill_from_status_2026-05-18] Conclusão registrada via status (sem registro formal via Concluir tarefa). Sem responsável nem arquivo.',
  cpt.updated_at,
  NULL,
  NULL
FROM cycle_phase_tasks cpt
LEFT JOIN event_cycle_phases ecp ON ecp.id = cpt.event_phase_id
WHERE cpt.status = 'concluida'
  AND NOT EXISTS (
    SELECT 1 FROM card_completions cc
    WHERE cc.task_id = cpt.id AND cc.reopened_at IS NULL
  );

-- Diagnóstico: quantos foram inseridos?
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM card_completions
   WHERE observacao = '[backfill_from_status_2026-05-18] Conclusão registrada via status (sem registro formal via Concluir tarefa). Sem responsável nem arquivo.';
  RAISE NOTICE 'Backfill: % completion(s) retroativa(s) criada(s)', v_count;
END $$;
