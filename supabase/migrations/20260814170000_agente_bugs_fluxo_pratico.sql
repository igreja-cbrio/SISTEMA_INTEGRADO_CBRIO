-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 · FLUXO PRÁTICO DE BUGS
-- Reportar bug (app Staff) → diagnóstico (agente Haiku, sem implementar) →
-- gate ÚNICO aprovar/recusar → correção com merge + migrations automáticos.
-- Decisões do Marcos (2026-08-14): sem G1/G2 para bugs; agente mergea o
-- próprio PR e aplica migration de produção sozinho (sobreescreve a regra
-- "nunca mergear PR próprio" SÓ no fluxo de bug aprovado).
-- ADITIVA e idempotente · não toca em dados existentes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. agent_tarefas · colunas do fluxo de bug
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_tarefas
  ADD COLUMN IF NOT EXISTS reportado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS diagnostico    text,
  ADD COLUMN IF NOT EXISTS diagnostico_em timestamptz;

-- status: + em_diagnostico (agente analisando) e rejeitada (terminal após recusa)
ALTER TABLE public.agent_tarefas DROP CONSTRAINT IF EXISTS agent_tarefas_status_check;
ALTER TABLE public.agent_tarefas ADD CONSTRAINT agent_tarefas_status_check
  CHECK (status IN ('nova','agendada','em_diagnostico','em_andamento','aguardando_revisao','aguardando_aprovacao','concluida','falhou','bloqueada','cancelada','rejeitada'));

-- classe: + bug (relato vindo do app Staff)
ALTER TABLE public.agent_tarefas DROP CONSTRAINT IF EXISTS agent_tarefas_classe_check;
ALTER TABLE public.agent_tarefas ADD CONSTRAINT agent_tarefas_classe_check
  CHECK (classe IN ('dev','bug','cyber','auditoria','executor','watcher'));

COMMENT ON COLUMN public.agent_tarefas.reportado_por IS
  'Colaborador (profiles.id) que reportou o bug no app Staff. Recebe a notificação "Bug corrigido" quando a tarefa conclui.';
COMMENT ON COLUMN public.agent_tarefas.diagnostico IS
  'Análise do agente (fase de diagnóstico, Haiku): causa raiz, arquivos/linhas envolvidos e correção proposta. Sem PII.';
COMMENT ON COLUMN public.agent_tarefas.diagnostico_em IS
  'Quando o diagnóstico ficou pronto e a tarefa passou a aguardar aprovação (gate único).';

-- ⚠️ NOTA: rodar `NOTIFY pgrst, 'reload schema'` após aplicar no SQL Editor
-- (ou aplicar pelo painel do Supabase, que já recarrega o schema).
