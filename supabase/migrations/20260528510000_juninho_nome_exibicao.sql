-- ============================================================================
-- Pr. Juninho · corrige nome de exibicao 'juninho' -> 'Juninho'
-- Conta oficial confirmada pelo Marcos (2026-05-28): juninho@cbrio.com.br
-- (a outra, juninho.lit@cbrio.org, fica como esta · possivel duplicata a tratar
--  depois). Pr. Pedrao nao tem conta no sistema · nada a marcar.
--
-- Sincroniza os text-mirrors legados (projects.leader/responsible, usuarios.nome)
-- pra nao desencontrar do filtro escopo_proprio de /projetos, que compara nome.
-- Mesmo padrao da renomeacao "Alda Lorena -> Lorena". Idempotente.
-- ============================================================================
BEGIN;

UPDATE public.profiles SET name = 'Juninho'
 WHERE lower(email) = 'juninho@cbrio.com.br' AND name = 'juninho';

UPDATE public.projects SET leader = 'Juninho'      WHERE leader ILIKE 'juninho';
UPDATE public.projects SET responsible = 'Juninho' WHERE responsible ILIKE 'juninho';

UPDATE public.usuarios SET nome = 'Juninho'
 WHERE lower(email) = 'juninho@cbrio.com.br' AND nome ILIKE 'juninho';

COMMIT;
