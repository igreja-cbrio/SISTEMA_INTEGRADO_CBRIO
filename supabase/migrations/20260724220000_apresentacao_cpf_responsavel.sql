-- Apresentação de bebês · CPF do responsável obrigatório (pedido da gestão ·
-- 2026-07-24 · toda inscrição do sistema pede CPF). Aditiva/idempotente.
ALTER TABLE public.apresentacao_criancas
  ADD COLUMN IF NOT EXISTS cpf_responsavel text;
COMMENT ON COLUMN public.apresentacao_criancas.cpf_responsavel IS
  'CPF (digits-only) do responsável que fez a inscrição pública';
