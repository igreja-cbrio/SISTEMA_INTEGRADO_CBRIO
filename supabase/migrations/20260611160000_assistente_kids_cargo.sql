-- ─────────────────────────────────────────────────────────────────────────
-- Cargo de permissão "Assistente de Kids" (assistente-kids)
--
-- Espelha o baseline do "assistente-area" (assistente ligado a uma área de
-- culto). Quem tiver este cargo + a área KIDS ganha nível 5 no módulo `kids`
-- pelo boost por área (AREA_MODULO_BOOST em backend/middleware/auth.js) — o
-- mesmo modelo do coordenador-kids/coordenador-ami etc.
--
-- NÃO atribui ninguém: a Luzia (Assistente CBKids) e o Amaury (Operações)
-- ainda estão SEM e-mail e SEM conta de login no sistema, então atribuir o
-- cargo agora seria lógica morta (não casaria com nenhum login e marcaria
-- "com acesso" sem ser verdade). O cargo fica pronto; a atribuição é 1 clique
-- na ficha assim que tiverem e-mail + conta.
--
-- Idempotente (WHERE NOT EXISTS / ON CONFLICT). Após aplicar: bust de cache de
-- permissões (POST /api/permissoes/cache/bust ou botão em /admin/permissoes).
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1. Cria o cargo (se ainda não existe)
INSERT INTO public.cargos
  (slug, nome, nome_completo, descricao, categoria, nivel_padrao_leitura, nivel_padrao_escrita, ordem, ativo, titular_sugerido)
SELECT
  'assistente-kids', 'Assist Kids', 'Assistente de Kids',
  'Assistente do ministério infantil · staff de culto', 'assistencia',
  3, 3, 118, true, 'Luzia Peron (KIDS)'
WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'assistente-kids');

-- 2. Seed da matriz cargo×módulo: copia as linhas do assistente-area.
INSERT INTO public.cargo_modulo_permissao
  (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT novo.id, cmp.modulo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
FROM public.cargo_modulo_permissao cmp
JOIN public.cargos base ON base.id = cmp.cargo_id AND base.slug = 'assistente-area'
CROSS JOIN public.cargos novo
WHERE novo.slug = 'assistente-kids'
ON CONFLICT (cargo_id, modulo_id) DO NOTHING;

COMMIT;
