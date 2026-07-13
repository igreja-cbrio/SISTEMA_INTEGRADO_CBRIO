-- RH · dados pessoais mantidos pelo próprio colaborador (self-service).
-- Já aplicada em prod via MCP em 2026-07-13. Aditiva/idempotente.
alter table public.rh_funcionarios add column if not exists endereco text;
alter table public.rh_funcionarios add column if not exists filhos jsonb not null default '[]'::jsonb;
comment on column public.rh_funcionarios.filhos is 'Filhos do colaborador (self-service): array [{nome?, idade}]. Vazio = sem filhos.';
