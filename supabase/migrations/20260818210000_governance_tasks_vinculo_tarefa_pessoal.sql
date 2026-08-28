-- Vínculo entre a pendência da ATA Semanal e a tarefa pessoal gerada a partir
-- dela ("Minhas Tarefas").
--
-- Por que uma coluna e não inferência por título: sem o vínculo, o botão
-- "virar tarefa" criaria uma tarefa nova a cada clique, e a tela não teria como
-- saber que a pendência já foi enviada — o usuário clicaria de novo por dúvida
-- e acumularia duplicatas silenciosas.
--
-- ON DELETE SET NULL de propósito: se a pessoa apagar a tarefa no Minhas
-- Tarefas, a pendência volta a poder ser enviada, em vez de ficar presa
-- apontando para algo que não existe mais.
--
-- Aplicada em produção via MCP em 18/08/2026; versionada aqui.

alter table governance_tasks
  add column if not exists tarefa_pessoal_id uuid
    references tarefas_pessoais(id) on delete set null;

comment on column governance_tasks.tarefa_pessoal_id is
  'Tarefa pessoal criada a partir desta pendência (ATA Semanal → Minhas Tarefas). NULL = ainda não enviada.';

create index if not exists idx_governance_tasks_tarefa_pessoal
  on governance_tasks(tarefa_pessoal_id)
  where tarefa_pessoal_id is not null;
