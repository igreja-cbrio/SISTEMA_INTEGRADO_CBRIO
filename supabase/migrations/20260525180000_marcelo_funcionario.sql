-- =====================================================================
-- Marcelo Soares · adicionar em rh_funcionarios
-- =====================================================================
-- Marcelo e funcionario da CBRio (Supervisor de Jornada). Estava apenas
-- em mem_membros (via seed_membro), faltava registro em rh_funcionarios.
-- Sem isso ele nao aparece na lista de colaboradores do /admin/permissoes.
--
-- Usa o helper public.seed_funcionario(nome, cargo, area, email) que ja
-- existe (idempotente · pula se ja existir, UPDATE se faltar cargo/area).
-- =====================================================================

SELECT public.seed_funcionario(
  'Marcelo Soares',
  'Supervisor de Jornada',
  'Ministerial',
  'marcelo.soares@cbrio.org'
);

-- Conferencia
-- SELECT id, nome, cargo, area, email, status FROM public.rh_funcionarios
--  WHERE LOWER(nome) LIKE '%marcelo%soares%';
