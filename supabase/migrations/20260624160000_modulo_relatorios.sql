-- Módulo Relatórios (ministerial) · catálogo + matriz de permissão (2026-06-24)
-- Builder de relatórios por período (frequência, decisões, batismos, voluntários,
-- grupos, membresia) com export em Excel/PDF. Só leitura de dados existentes.

INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'relatorios', 'Relatórios', '/ministerial/relatorios', 'ministerial', 145,
       'Frequência, decisões, batismos, voluntários, grupos e membresia por período (Excel/PDF)', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'relatorios');

-- Seed da matriz cargo×módulo copiando do módulo 'integracao' (mesmo público).
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'integracao';
  IF base_modulo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_modulo_id
       AND novo.slug = 'relatorios'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;
