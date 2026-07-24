-- ============================================================================
-- Next · corrige acentuação no nome da turma "container" de check-ins legados
--
-- A migration 20260626180000 inseriu a turma com o nome sem acento
-- ("Historico - check-in (sem turma)"), visível na aba Next da Integração.
-- Regra global de acentuação (CLAUDE.md) exige "Histórico". Update idempotente
-- por origem_mes='hist-checkin' (chave estável da turma-container).
-- ============================================================================

UPDATE public.next_turmas
SET nome = 'Histórico - check-in (sem turma)'
WHERE origem_mes = 'hist-checkin'
  AND nome = 'Historico - check-in (sem turma)';
