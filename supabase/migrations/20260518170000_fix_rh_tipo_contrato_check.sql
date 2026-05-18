-- ─────────────────────────────────────────────────────────────────────────
-- PCS · fix do check constraint de tipo_contrato em rh_funcionarios
--
-- Contexto: a migration 20260518160000_pcs_modulo_fix_legacy.sql falhou em
-- produção ao inserir funcionários novos com tipo_contrato='PJ' porque
-- existe um check constraint `rh_funcionarios_tipo_contrato_check` na
-- tabela (criado manualmente direto no Supabase, fora das migrations) que
-- rejeita valores diferentes de 'CLT'.
--
-- O PCS usa 4 tipos de contrato: CLT, PJ, PJ+ (PJ com remuneração bruta
-- diferenciada), PREBENDA. Esta migration:
--
--   1. Dropa o constraint antigo (se existir)
--   2. Recria um constraint permissivo que aceita os 4 tipos + NULL
--
-- Após aplicar esta migration, re-rodar a 20260518160000_pcs_modulo_fix_legacy.sql
-- para concluir a criação do módulo PCS (ela é idempotente via IF NOT EXISTS
-- e ON CONFLICT, então é seguro re-aplicar).
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.rh_funcionarios
  DROP CONSTRAINT IF EXISTS rh_funcionarios_tipo_contrato_check;

ALTER TABLE public.rh_funcionarios
  ADD CONSTRAINT rh_funcionarios_tipo_contrato_check
  CHECK (tipo_contrato IS NULL OR tipo_contrato IN ('CLT', 'PJ', 'PJ+', 'PREBENDA'));

COMMIT;
