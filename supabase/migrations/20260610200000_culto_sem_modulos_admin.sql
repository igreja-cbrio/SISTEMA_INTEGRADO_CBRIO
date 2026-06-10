-- ============================================================================
-- Pessoal ministerial de culto NÃO vê módulos de administração/gestão
-- (exceto Solicitações) · decisão do Marcos · 2026-06-10
-- ============================================================================
-- Contexto: com o sistema aberto a todos os funcionários, os cargos de culto
-- (coordenador-kids/ami/online + assistente-ministerial/assistente-area)
-- ainda carregavam células herdadas de cópias de matriz antigas:
--   gestao=1-2 · planejamento=1-4(+E) · eventos=1-3 · projetos=1-2 · expansao=1-2
-- → viam "Gestão (PMO)", "Eventos", "Projetos" e "Expansão" no menu e tinham
-- nível 4 latente em /planejamento por URL.
--
-- O coordenador-bridge já estava limpo (modelo) — entra na lista só por
-- consistência (UPDATE é no-op nele). RH/Financeiro/Logística/Patrimônio já
-- eram 0 nesses cargos. Solicitações (nível 2) fica intocada.
--
-- NÃO mexe no lider-ministerial: projetos=3+escopo_proprio é decisão anterior
-- do Marcos (líder vê só os projetos onde é leader/responsible).
-- NÃO mexe em overrides individuais (ex.: Diego Assis, assistente-area com
-- overrides nível 5 em financeiro/logistica/patrimonio/projetos — gestão).
--
-- Idempotente · re-rodar é no-op.
-- ⚠️ Pós-aplicação: bust de cache (POST /api/permissoes/cache/bust ou botão em
-- /admin/permissoes) + logout/login dos afetados pra renovar o JWT.

UPDATE public.cargo_modulo_permissao cmp
SET nivel = 0,
    pode_exportar = false,
    pode_aprovar = false,
    escopo_proprio = false
FROM public.cargos c, public.modulos m
WHERE cmp.cargo_id = c.id
  AND cmp.modulo_id = m.id
  AND c.slug IN (
    'coordenador-kids',
    'coordenador-ami',
    'coordenador-bridge',
    'coordenador-online',
    'assistente-ministerial',
    'assistente-area'
  )
  AND m.slug IN ('gestao', 'planejamento', 'eventos', 'projetos', 'expansao')
  AND cmp.nivel <> 0;
