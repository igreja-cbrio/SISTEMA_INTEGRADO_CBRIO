-- ============================================================================
-- Finalizacao dos modulos de culto (Kids/AMI/Bridge/Online)
-- ============================================================================
-- Decisoes do Marcos (2026-05-20):
-- 1. Renomear modulo "CBKids" → "Kids"
-- 2. Criar 3 cargos novos: coordenador-kids, coordenador-ami, coordenador-bridge
--    (matriz copiada do coordenador-online · que ja existe)
-- 3. Matriz dos 4 modulos de culto · nivel 1 pra TODOS os cargos ativos
--    (qualquer pessoa pode visualizar cultos)
-- 4. Tirar pode_exportar de TODOS os cargos nesses 4 modulos (read-only sem export)
-- 5. Atribuir titulares:
--    - Mariane Gaia · coordenador-kids · area KIDS
--    - Arthur Cecconi · coordenador-ami · area AMI
--    - Lillian Xavier · coordenador-bridge · area Bridge (criar registro + mem_membros)
-- 6. AREA_MODULO_BOOST ja contempla kids/ami/bridge → titulares ganham
--    nivel 5 (admin) no proprio modulo automaticamente
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Renomeia modulo Kids
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.modulos
   SET nome = 'Kids'
 WHERE slug = 'kids' AND nome <> 'Kids';

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Cria 3 cargos novos (NOT EXISTS · cargos.slug nao tem unique)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-kids', 'Coord Kids', 'Coordenador de Kids', 'Mariane Gaia', 119, 'coordenacao', 'Coordenador do ministerio infantil · staff de culto', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-kids');

INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-ami', 'Coord AMI', 'Coordenador de AMI', 'Arthur Cecconi', 120, 'coordenacao', 'Coordenador AMI (adolescentes/jovens) · staff de culto', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-ami');

INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-bridge', 'Coord Bridge', 'Coordenador de Bridge', 'Lillian Xavier', 121, 'coordenacao', 'Coordenador do culto Bridge · staff de culto', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-bridge');

-- ─────────────────────────────────────────────────────────────────────
-- Passo 3 · Matriz dos 3 cargos novos · copia do coordenador-online
--   (que ja foi criado na PR #551 com matriz do coordenador-marketing)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE base_id int;
BEGIN
  SELECT id INTO base_id FROM public.cargos WHERE slug = 'coordenador-online';
  IF base_id IS NULL THEN
    RAISE EXCEPTION 'coordenador-online nao encontrado · rode PR #551 antes';
  END IF;

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
-- Passo 4 · Nivel 1 nos 4 modulos de culto pra TODOS os cargos ativos
--   (todo mundo pode visualizar cultos · sem export, sem aprovacao)
--   Se cargo ja tem nivel > 1, mantem (Math.max). Boost por area continua
--   elevando pra 5 quem tiver area correspondente.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT c.id, m.id, 1, false, false, false
  FROM public.cargos c
 CROSS JOIN public.modulos m
 WHERE c.ativo = true AND c.slug IS NOT NULL
   AND m.slug IN ('kids', 'ami', 'bridge', 'online')
ON CONFLICT (cargo_id, modulo_id) DO UPDATE
   SET nivel = GREATEST(public.cargo_modulo_permissao.nivel, 1),
       pode_exportar = false,  -- forca sem export nos modulos de culto
       updated_at = now();

-- ─────────────────────────────────────────────────────────────────────
-- Passo 5 · Atribui Mariane Gaia · coordenador-kids
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-kids')
 WHERE LOWER(TRIM(email)) = 'mariane.gaia@cbrio.org';

-- Garante area KIDS pra Mariane (alem das outras que ja tinha)
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'mariane.gaia@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'kids' LIMIT 1),
  false
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'mariane.gaia@cbrio.org') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas
      WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'mariane.gaia@cbrio.org')
        AND area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'kids' LIMIT 1)
   );

-- ─────────────────────────────────────────────────────────────────────
-- Passo 6 · Atribui Arthur Cecconi · coordenador-ami
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-ami')
 WHERE LOWER(TRIM(email)) = 'arthur.cecconi@cbrio.org';

INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'arthur.cecconi@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'ami' LIMIT 1),
  false
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'arthur.cecconi@cbrio.org') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas
      WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'arthur.cecconi@cbrio.org')
        AND area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'ami' LIMIT 1)
   );

-- ─────────────────────────────────────────────────────────────────────
-- Passo 7 · Cadastra Lillian Xavier (nova · lillian.xavier@cbrio.org)
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

INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'lillian.xavier@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'bridge' LIMIT 1),
  true
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'lillian.xavier@cbrio.org') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas
      WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'lillian.xavier@cbrio.org')
        AND area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'bridge' LIMIT 1)
   );

-- ─────────────────────────────────────────────────────────────────────
-- Conferencia (descomente):
-- SELECT u.email, u.nome, c.slug AS cargo, array_agg(a.nome ORDER BY a.nome) AS areas
--   FROM usuarios u
--   LEFT JOIN cargos c ON c.id = u.cargo_id
--   LEFT JOIN usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN areas a ON a.id = ua.area_id
--  WHERE LOWER(u.email) IN ('mariane.gaia@cbrio.org', 'arthur.cecconi@cbrio.org', 'lillian.xavier@cbrio.org')
--  GROUP BY u.email, u.nome, c.slug;
