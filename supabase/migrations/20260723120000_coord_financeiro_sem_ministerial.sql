-- Coordenador Financeiro NAO ve modulos ministeriais nem cultos (decisao Marcos 2026-07-23)
-- Alberto Luiz (coord-financeiro) estava vendo Integracao/cultos e demais modulos
-- ministeriais por leitura herdada da matriz do cargo. Coordenador financeiro nao
-- deve ver ministerio por definicao -> zerado na matriz padrao do cargo (fonte).
-- Idempotente: reduzir a nivel 0 mantem 0 em re-execucao. Backwards-compatible.
-- Cobre ministerio E cultos: toda a operacao de culto (integracao, online, kids,
-- ami, bridge, producao, batismo, next, ...) vive na categoria 'ministerial'.
-- ⚠️ Apos aplicar: bust do cache do middleware de permissoes
--    (POST /api/permissoes/cache/bust ou botao em /admin/permissoes) +
--    logout/login dos usuarios afetados (renova o JWT).

UPDATE public.cargo_modulo_permissao cmp
SET nivel = 0,
    pode_exportar = false,
    pode_aprovar = false,
    escopo_proprio = false
FROM public.modulos m,
     public.cargos c
WHERE m.id = cmp.modulo_id
  AND c.id = cmp.cargo_id
  AND c.slug = 'coordenador-financeiro'
  AND m.categoria = 'ministerial'
  AND cmp.nivel > 0;
