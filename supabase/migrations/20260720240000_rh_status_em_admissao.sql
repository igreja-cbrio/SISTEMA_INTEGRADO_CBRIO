-- Onboarding de RH: novo contratado entra com status 'em_admissao' e vira
-- 'ativo' ao concluir a admissão (backend rh.js:696 · frontend RH.jsx:421).
-- A constraint não permitia esse valor → "Nova admissão" quebrava com
-- "violates check constraint rh_funcionarios_status_check". Widening (seguro).
-- Já aplicada via MCP.
ALTER TABLE public.rh_funcionarios DROP CONSTRAINT IF EXISTS rh_funcionarios_status_check;
ALTER TABLE public.rh_funcionarios ADD CONSTRAINT rh_funcionarios_status_check
  CHECK (status = ANY (ARRAY['ativo'::text, 'inativo'::text, 'ferias'::text, 'licenca'::text, 'em_admissao'::text]));
