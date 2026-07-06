-- Yago Torres saiu do financeiro → coordenador estratégico (pedido 2026-07-06).
-- Novo cargo 'coordenador-estrategico' (o 'coordenador-estrategia' existente é
-- nível diretor · 5 em tudo — acima do necessário). Seed = cópia do cargo
-- coordenador-financeiro (id 40, cargo anterior do Yago) com os módulos
-- estratégicos elevados pra edição. Financeiro mantido por ora: Yago segue
-- como portão de aprovação financeira das solicitações até definirem o
-- substituto. JÁ APLICADA em prod via MCP; arquivo versiona no repo.

INSERT INTO public.cargos (slug, nome)
SELECT 'coordenador-estrategico', 'Coord Estratégico'
WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-estrategico');

INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT novo.id, cmp.modulo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
FROM public.cargo_modulo_permissao cmp
CROSS JOIN (SELECT id FROM public.cargos WHERE slug = 'coordenador-estrategico') novo
WHERE cmp.cargo_id = 40
ON CONFLICT (cargo_id, modulo_id) DO NOTHING;

UPDATE public.cargo_modulo_permissao cmp
SET nivel = v.nivel
FROM (VALUES
  ('expansao', 3), ('planejamento', 3), ('projetos', 3),
  ('revisao-estrategica', 3), ('gestao', 2), ('governanca', 1)
) AS v(slug, nivel), public.modulos m, public.cargos c
WHERE m.slug = v.slug AND cmp.modulo_id = m.id
  AND c.slug = 'coordenador-estrategico' AND cmp.cargo_id = c.id
  AND cmp.nivel < v.nivel;

UPDATE public.usuarios SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-estrategico')
WHERE id = 74 AND email = 'yago.torres@cbrio.org';
