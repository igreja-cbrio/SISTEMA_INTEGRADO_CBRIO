-- Módulo de Inscrições · F3.2 PR 2 — entrada no catálogo de permissões
-- (padrão "adicionar novo módulo" do CLAUDE.md). Matriz seed copiada de
-- eventos-externos (mesmo público-alvo até a migração do ext · SPEC-04).
SET lock_timeout = '10s';

INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'inscricoes', 'Inscrições', '/inscricoes', 'operacional', 216,
       'Módulo central de inscrições · calendário, eventos, séries e relatórios', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'inscricoes');

DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'eventos-externos';
  IF base_modulo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_modulo_id
       AND novo.slug = 'inscricoes'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;
