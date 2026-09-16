-- ============================================================================
-- Apresentação de crianças · de QUEM é o CPF (pai ou mãe)
-- 2026-09-16 · achado do Marcos ao testar
--
--   "ele pede o nome dos dois responsáveis e apenas 1 cpf, ou seja algum
--    responsável fica sem, ou pior ele vincula o cpf no responsável errado"
--
-- ⚠️⚠️ MEDIDO ANTES DE MEXER: nas 9 inscrições em que dá pra saber o dono do
-- CPF, **3 eram do PAI** (Robson Ribeiro com 2 filhos + 1 teste). O VÍNCULO não
-- saiu errado — o matcher prioriza CPF sobre nome — mas o par que chegava nele
-- era falso: CPF de um com o nome do outro. Quando o CPF não está no cadastro,
-- é o nome que decide, e decidiria pela pessoa errada.
--
-- `cpf_responsavel` CONTINUA sendo o CPF principal (é o que o resto do sistema
-- já lê). Estas colunas dizem de quem ele é, e guardam o do outro responsável
-- quando a família informa os dois.
--
-- ⚠️ Linhas antigas ficam com as duas colunas NULAS de propósito: não dá pra
-- saber de quem era o CPF sem adivinhar por nome, e a ficha prefere dizer
-- "CPF do responsável" a afirmar um dono que ninguém confirmou.
-- ============================================================================

ALTER TABLE public.apresentacao_criancas
  ADD COLUMN IF NOT EXISTS cpf_pai text,
  ADD COLUMN IF NOT EXISTS cpf_mae text;

COMMENT ON COLUMN public.apresentacao_criancas.cpf_pai IS
  'CPF do PAI (só dígitos), quando a família disse que o CPF é dele ou informou o do outro responsável. NULL em inscrição anterior a 16/09/2026 — ali só existe cpf_responsavel, sem dono declarado.';
COMMENT ON COLUMN public.apresentacao_criancas.cpf_mae IS
  'CPF da MÃE (só dígitos). Mesma regra do cpf_pai.';

-- ── Conferência (rodar DEPOIS, no SQL Editor) ───────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'apresentacao_criancas' and column_name in ('cpf_pai','cpf_mae');
-- select count(*) filter (where cpf_pai is not null) as com_cpf_pai,
--        count(*) filter (where cpf_mae is not null) as com_cpf_mae,
--        count(*) as total
--   from public.apresentacao_criancas where deleted_at is null;
