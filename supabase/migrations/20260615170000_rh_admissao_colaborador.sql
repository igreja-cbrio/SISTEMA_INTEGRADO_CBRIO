-- ============================================================
-- Admissão como STATUS do colaborador (não cria tabela nova)
-- ------------------------------------------------------------
-- O novo contratado passa a entrar direto em rh_funcionarios com
-- status='em_admissao' e vira 'ativo' ao concluir o onboarding. A antiga
-- "aba Admissão" (que batia em /rh/admissoes — tabela/rotas inexistentes)
-- sai; a gestão passa pra ficha do colaborador dentro de Colaboradores.
--
-- Os dados extras do processo (RG, nascimento, endereço, dados de PJ,
-- etapa, contrato gerado) — que não têm coluna própria — viajam neste
-- jsonb aditivo. Mantidos depois como histórico do onboarding.
--
-- rh_funcionarios.status é TEXT NOT NULL DEFAULT 'ativo' SEM CHECK, então
-- o valor 'em_admissao' é aceito sem alterar constraint. Migration ADITIVA
-- e idempotente · sem risco de schema destrutivo.
-- ============================================================

ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS admissao_dados jsonb;

COMMENT ON COLUMN public.rh_funcionarios.admissao_dados IS
  'Dados extras do processo de admissão (RG, data_nascimento, endereco, dados PJ: razao_social/cnpj/banco/pix…, etapa, contrato_editado). Preenchido enquanto status=em_admissao; preservado como histórico após ativar.';
