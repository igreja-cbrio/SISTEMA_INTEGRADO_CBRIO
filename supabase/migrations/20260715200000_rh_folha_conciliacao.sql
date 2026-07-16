-- Conciliação da folha: vínculo de lançamentos de pessoal (fin_transacoes) a
-- colaboradores (rh_funcionarios) para o histórico de pagamentos por colaborador.
--
-- A coluna fin_transacoes.funcionario_id (FK -> rh_funcionarios) já existe; aqui
-- só adicionamos:
--   1) índice parcial pra buscar pagamentos por colaborador rápido;
--   2) tabela de "ignorados" — lançamentos de pessoal (4.01%) revisados que NÃO
--      são atribuíveis a um colaborador (rateios, aggregate, etc.), pra sumirem
--      da fila de vínculo manual sem poluir.

-- 1) Índice pra leitura do histórico por colaborador
create index if not exists idx_fin_transacoes_funcionario
  on public.fin_transacoes (funcionario_id)
  where funcionario_id is not null;

-- 2) Fila de vínculo · marcações de "não atribuível a colaborador"
create table if not exists public.rh_folha_ignorados (
  transacao_id uuid primary key references public.fin_transacoes(id) on delete cascade,
  ignorado_por uuid,
  created_at   timestamptz not null default now()
);

alter table public.rh_folha_ignorados enable row level security;

-- Todo o acesso é mediado pelo backend (service role); guards de RH no Express.
drop policy if exists rh_folha_ignorados_service on public.rh_folha_ignorados;
create policy rh_folha_ignorados_service
  on public.rh_folha_ignorados for all to service_role
  using (true) with check (true);
