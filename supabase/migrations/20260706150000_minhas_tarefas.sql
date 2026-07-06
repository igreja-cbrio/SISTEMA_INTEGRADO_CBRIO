-- Minhas Tarefas · página pessoal /tarefas (lista + kanban + calendário)
-- Repurposa a tabela tarefas_pessoais (legado do módulo Processos · 0 linhas):
--  1) status pro kanban (a_fazer/fazendo/concluida · done vira derivado)
--  2) data vira opcional (tarefa "sem prazo" só aparece em lista/kanban)
--  3) updated_at
--  4) RLS de leitura restrita ao DONO (era authenticated → qualquer um lia tudo
--     via anon key; escrita segue via backend service-role com ownership check)

ALTER TABLE public.tarefas_pessoais
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'a_fazer'
    CHECK (status IN ('a_fazer','fazendo','concluida')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.tarefas_pessoais ALTER COLUMN data DROP NOT NULL;

-- Consistência: tarefas concluídas espelham done (tabela está vazia, mas idempotente)
UPDATE public.tarefas_pessoais SET status = 'concluida' WHERE done = true AND status <> 'concluida';

CREATE INDEX IF NOT EXISTS idx_tarefas_pessoais_dono
  ON public.tarefas_pessoais (created_by, data);

-- RLS: leitura só do dono (privacidade pedida: "cada um vê apenas as suas")
-- Policies vivas em prod: tarefas_pessoais_read (aberta a authenticated) e
-- tarefas_pessoais_write — substituídas por dono-only + service_role.
DROP POLICY IF EXISTS tarefas_pessoais_read ON public.tarefas_pessoais;
DROP POLICY IF EXISTS tarefas_pessoais_write ON public.tarefas_pessoais;
CREATE POLICY tarefas_pessoais_read_own ON public.tarefas_pessoais
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY tarefas_pessoais_service ON public.tarefas_pessoais
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tarefas_pessoais IS
  'Tarefas pessoais por usuário (página /tarefas · lista/kanban/calendário). created_by = dono (auth uid). status manda; done é espelho pra compat com a agenda semanal legada (ProcessosTarefas).';
