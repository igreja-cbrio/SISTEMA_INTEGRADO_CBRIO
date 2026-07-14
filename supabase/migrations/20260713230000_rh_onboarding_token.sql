-- Formulário público de onboarding do colaborador (link que o RH envia).
-- Já aplicada em prod via MCP (2026-07-13).
alter table public.rh_funcionarios add column if not exists onboarding_token text;
alter table public.rh_funcionarios add column if not exists onboarding_enviado_em timestamptz;
alter table public.rh_funcionarios add column if not exists onboarding_preenchido_em timestamptz;
create unique index if not exists idx_rh_func_onboarding_token on public.rh_funcionarios(onboarding_token) where onboarding_token is not null;
