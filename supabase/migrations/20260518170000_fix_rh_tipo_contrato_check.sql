-- ─────────────────────────────────────────────────────────────────────────
-- PCS · fix do check constraint de tipo_contrato em rh_funcionarios
--
-- Contexto: a migration 20260518160000_pcs_modulo_fix_legacy.sql falhou em
-- produção ao inserir funcionários novos com tipo_contrato='PJ' porque
-- existe um check constraint `rh_funcionarios_tipo_contrato_check` na
-- tabela (criado manualmente direto no Supabase, fora das migrations) que
-- aceita apenas valores em minúsculas (pj/clt). Os 61 funcionários atuais
-- também estão com tipo_contrato em minúsculas.
--
-- O PCS usa 4 tipos de contrato em maiúsculas: CLT, PJ, PJ+ (PJ com
-- remuneração bruta diferenciada), PREBENDA. Esta migration:
--
--   1. Normaliza valores existentes (pj → PJ, clt → CLT) via upper()
--   2. Dropa o constraint antigo (case-sensitive lowercase)
--   3. Recria um constraint permissivo que aceita os 4 tipos uppercase + NULL
--
-- Após aplicar esta migration, re-rodar a 20260518160000_pcs_modulo_fix_legacy.sql
-- para concluir a criação do módulo PCS (ela é idempotente via IF NOT EXISTS
-- e ON CONFLICT, então é seguro re-aplicar).
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Dropa o constraint antigo ANTES de qualquer UPDATE.
--    Se o UPDATE rodar antes, ele bate no constraint legado (lowercase-only)
--    e falha porque upper(pj) = 'PJ' não está no IN list antigo.
ALTER TABLE public.rh_funcionarios
  DROP CONSTRAINT IF EXISTS rh_funcionarios_tipo_contrato_check;

-- 2. Normaliza valores existentes (pj → PJ, clt → CLT, etc).
UPDATE public.rh_funcionarios
SET tipo_contrato = upper(tipo_contrato)
WHERE tipo_contrato IS NOT NULL
  AND tipo_contrato <> upper(tipo_contrato);

-- 3. Recria constraint aceitando os 4 tipos do PCS em uppercase.
ALTER TABLE public.rh_funcionarios
  ADD CONSTRAINT rh_funcionarios_tipo_contrato_check
  CHECK (tipo_contrato IS NULL OR tipo_contrato IN ('CLT', 'PJ', 'PJ+', 'PREBENDA'));

COMMIT;
