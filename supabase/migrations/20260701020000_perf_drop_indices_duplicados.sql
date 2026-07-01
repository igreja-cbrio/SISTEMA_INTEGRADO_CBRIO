-- Performance · remove índices DUPLICADOS (idênticos) apontados pelo
-- Performance Advisor do Supabase (lint 0009_duplicate_index · 2026-07-01).
--
-- Cada par abaixo tem 2 índices idênticos na mesma tabela/coluna; manter os
-- dois só custa escrita e armazenamento sem ganho de leitura. Dropar um de
-- cada par é SEGURO: índice não é referenciado por nome em query nenhuma
-- (o planner usa o que sobrar). Mantemos o nome mais descritivo/alinhado ao
-- nome da tabela e removemos o redundante. Idempotente (IF EXISTS).

-- cycle_phase_tasks · responsável (mantém idx_cycle_phase_tasks_responsavel_id)
DROP INDEX IF EXISTS public.idx_cc_tasks_responsavel;

-- notificacoes · created (mantém idx_notificacoes_created)
DROP INDEX IF EXISTS public.idx_notif_created;

-- rh_escalas_extras · funcionário (mantém idx_rh_escalas_extras_func)
DROP INDEX IF EXISTS public.idx_rh_escalas_funcionario;

-- rh_escalas_extras · status (mantém idx_rh_escalas_extras_status)
DROP INDEX IF EXISTS public.idx_rh_escalas_status;
