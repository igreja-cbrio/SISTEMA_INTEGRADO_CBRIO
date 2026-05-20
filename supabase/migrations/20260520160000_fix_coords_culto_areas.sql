-- ============================================================================
-- Fix · 3 coordenadores de culto · cargo + area limpa
-- ============================================================================
-- Marcos (2026-05-20): "Mariane/Arthur estao com cargo NULL e areas
-- esquisitas (Cuidados/Grupos/Integracao/Voluntariado · vieram da inferencia
-- anterior como lider-ministerial). Cargo deve ser coordenador-X e area
-- deve ser SO o culto correspondente".
--
-- Esta migration:
-- 1. Cria os 3 cargos se ainda nao existem (caso 20260520150000 nao rodou)
-- 2. Garante matriz copiada do coordenador-online
-- 3. REMOVE areas Cuidados/Grupos/Integracao/Voluntariado dos 3 titulares
-- 4. Forca cargo + area correta
-- 5. Cadastra Lillian se faltar
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Cria cargos (caso a 20260520150000 nao tenha rodado)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-kids', 'Coord Kids', 'Coordenador de Kids', 'Mariane Gaia', 119, 'coordenacao', 'Coordenador do ministerio infantil · staff de culto', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-kids');

INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-ami', 'Coord AMI', 'Coordenador de AMI', 'Arthur Cecconi', 120, 'coordenacao', 'Coordenador AMI · staff de culto', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-ami');

INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-bridge', 'Coord Bridge', 'Coordenador de Bridge', 'Lillian Xavier', 121, 'coordenacao', 'Coordenador do culto Bridge · staff de culto', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-bridge');

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Matriz dos 3 cargos · copia de coordenador-online (idempotente)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE base_id int;
BEGIN
  SELECT id INTO base_id FROM public.cargos WHERE slug = 'coordenador-online';
  IF base_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT c.id, cmp.modulo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
   CROSS JOIN public.cargos c
   WHERE cmp.cargo_id = base_id
     AND c.slug IN ('coordenador-kids', 'coordenador-ami', 'coordenador-bridge')
  ON CONFLICT (cargo_id, modulo_id) DO UPDATE
     SET nivel = EXCLUDED.nivel,
         pode_exportar = EXCLUDED.pode_exportar,
         pode_aprovar = EXCLUDED.pode_aprovar,
         escopo_proprio = EXCLUDED.escopo_proprio,
         updated_at = now();
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 3 · Mariane Gaia · coordenador-kids, area SO Kids
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-kids')
 WHERE LOWER(TRIM(email)) = 'mariane.gaia@cbrio.org';

-- Remove TODAS as areas atuais da Mariane
DELETE FROM public.usuario_areas
 WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'mariane.gaia@cbrio.org');

-- Adiciona so a area KIDS
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'mariane.gaia@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'kids' LIMIT 1),
  true
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'mariane.gaia@cbrio.org') IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 4 · Arthur Cecconi · coordenador-ami, area SO AMI
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-ami')
 WHERE LOWER(TRIM(email)) = 'arthur.cecconi@cbrio.org';

DELETE FROM public.usuario_areas
 WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'arthur.cecconi@cbrio.org');

INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'arthur.cecconi@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'ami' LIMIT 1),
  true
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'arthur.cecconi@cbrio.org') IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 5 · Lillian Xavier · coordenador-bridge, area SO Bridge
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.mem_membros (nome, email, status, active)
SELECT 'Lillian Xavier', 'lillian.xavier@cbrio.org', 'membro_ativo', true
 WHERE NOT EXISTS (SELECT 1 FROM public.mem_membros WHERE LOWER(TRIM(email)) = 'lillian.xavier@cbrio.org');

INSERT INTO public.usuarios (email, nome, cargo_id, ativo)
SELECT 'lillian.xavier@cbrio.org', 'Lillian Xavier',
       (SELECT id FROM public.cargos WHERE slug = 'coordenador-bridge'), true
 WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE LOWER(TRIM(email)) = 'lillian.xavier@cbrio.org');

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-bridge'),
       ativo = true
 WHERE LOWER(TRIM(email)) = 'lillian.xavier@cbrio.org';

DELETE FROM public.usuario_areas
 WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'lillian.xavier@cbrio.org');

INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'lillian.xavier@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'bridge' LIMIT 1),
  true
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'lillian.xavier@cbrio.org') IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 6 · Forca nivel 1 nos 4 modulos de culto pra TODOS os cargos
-- (caso a 20260520150000 nao tenha rodado · idempotente)
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.modulos SET nome = 'Kids' WHERE slug = 'kids' AND nome <> 'Kids';

INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT c.id, m.id, 1, false, false, false
  FROM public.cargos c
 CROSS JOIN public.modulos m
 WHERE c.ativo = true AND c.slug IS NOT NULL
   AND m.slug IN ('kids', 'ami', 'bridge', 'online')
ON CONFLICT (cargo_id, modulo_id) DO UPDATE
   SET nivel = GREATEST(public.cargo_modulo_permissao.nivel, 1),
       pode_exportar = false,
       updated_at = now();

-- Conferencia (descomente):
-- SELECT u.email, c.slug AS cargo, array_agg(a.nome ORDER BY a.nome) AS areas
--   FROM usuarios u
--   LEFT JOIN cargos c ON c.id = u.cargo_id
--   LEFT JOIN usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN areas a ON a.id = ua.area_id
--  WHERE LOWER(u.email) IN ('mariane.gaia@cbrio.org', 'arthur.cecconi@cbrio.org', 'lillian.xavier@cbrio.org')
--  GROUP BY u.email, c.slug;
