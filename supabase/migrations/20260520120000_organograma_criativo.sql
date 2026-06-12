-- ============================================================================
-- Organograma do Criativo · estrutura real (2026-05-20)
-- ============================================================================
-- Pepe Menezes (diretor-criativo)
--  ├── David Sicon (coordenador-adoracao · NOVO cargo)
--  ├── Pedro Paiva (coordenador-marketing)
--  │     ├── Lorena Pariz (assistente-marketing)
--  │     ├── Cauã Pedretti (assistente-marketing)
--  │     ├── Allan Santana (assistente-marketing · entrou apos organograma)
--  │     └── Letícia Baldner (assistente-marketing · entrou apos organograma)
--  ├── Pedro Fernandes (coordenador-producao · NOVO cargo · promove de lider)
--  │     └── Andre Rocha (lider-producao · transmissao · novo cadastro)
--  └── Renata Martins/Bispo (coordenador-online · NOVO cargo · coord de culto)
--
-- Mudanças:
-- 1. Cria 3 cargos novos · coordenador-adoracao, coordenador-producao,
--    coordenador-online (matriz copia coordenador-marketing)
-- 2. Atribui pessoas aos cargos corretos
-- 3. Cadastra Andre Rocha (and.0381@gmail.com) em usuarios + mem_membros
-- 4. Desativa Eliza Santos se existir
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Cria 3 cargos novos
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
VALUES
  ('coordenador-adoracao', 'Coord Ador', 'Coordenador de Adoração', 'David Sicon', 115, 'coordenacao', 'Coordenador de Adoração/Louvor · responde ao Diretor Criativo', 3, 3, true),
  ('coordenador-producao', 'Coord Prod', 'Coordenador de Produção', 'Pedro Fernandes', 117, 'coordenacao', 'Coordenador de Produção · responde ao Diretor Criativo', 3, 3, true),
  ('coordenador-online',   'Coord Onl',  'Coordenador de Online (Cultos)', 'Renata Martins', 118, 'coordenacao', 'Coordenador de Online · staff de culto · responde ao Diretor Criativo', 3, 3, true)
ON CONFLICT (slug) DO UPDATE
   SET nome_completo = EXCLUDED.nome_completo,
       titular_sugerido = EXCLUDED.titular_sugerido,
       ordem = EXCLUDED.ordem,
       categoria = EXCLUDED.categoria,
       descricao = EXCLUDED.descricao,
       ativo = true;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Matriz dos 3 cargos novos · copia do coordenador-marketing
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  base_cargo_id int;
BEGIN
  SELECT id INTO base_cargo_id FROM public.cargos WHERE slug = 'coordenador-marketing';
  IF base_cargo_id IS NULL THEN
    RAISE EXCEPTION 'coordenador-marketing nao encontrado';
  END IF;

  -- Pra cada um dos 3 cargos novos, replica linhas de cargo_modulo_permissao
  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT c.id, cmp.modulo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
   CROSS JOIN public.cargos c
   WHERE cmp.cargo_id = base_cargo_id
     AND c.slug IN ('coordenador-adoracao', 'coordenador-producao', 'coordenador-online')
  ON CONFLICT (cargo_id, modulo_id) DO UPDATE
     SET nivel = EXCLUDED.nivel,
         pode_exportar = EXCLUDED.pode_exportar,
         pode_aprovar = EXCLUDED.pode_aprovar,
         escopo_proprio = EXCLUDED.escopo_proprio,
         updated_at = now();
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 3 · Atribui cargos a David, Pedro Fernandes, Renata Martins
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-adoracao')
 WHERE LOWER(TRIM(email)) = 'david.sicon@cbrio.org';

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-producao')
 WHERE LOWER(TRIM(email)) = 'pedro.fernandes@cbrio.org';

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-online')
 WHERE LOWER(TRIM(email)) = 'renata.martins@cbrio.org';

-- ─────────────────────────────────────────────────────────────────────
-- Passo 4 · Ajusta areas
-- - David Sicon · area Louvor (sinonimo de Adoracao)
-- - Pedro Fernandes · area Producao
-- - Renata Martins · area Online
-- ─────────────────────────────────────────────────────────────────────

-- David Sicon · garante apenas a area Louvor
DELETE FROM public.usuario_areas
 WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org')
   AND area_id != (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'louvor' LIMIT 1);
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'louvor' LIMIT 1),
  true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.usuario_areas
    WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org')
      AND area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'louvor' LIMIT 1)
 );

-- ─────────────────────────────────────────────────────────────────────
-- Passo 5 · Cadastra Andre Rocha (and.0381@gmail.com)
--   - usuarios (sistema granular)
--   - mem_membros (igreja · pra acessar devocional)
--   - usuario_areas · Produção
-- ─────────────────────────────────────────────────────────────────────

-- 5a · mem_membros
INSERT INTO public.mem_membros (nome, email, status, active)
SELECT 'André Teixeira Rocha', 'and.0381@gmail.com', 'membro_ativo', true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.mem_membros WHERE LOWER(TRIM(email)) = 'and.0381@gmail.com'
 );

-- 5b · usuarios
INSERT INTO public.usuarios (email, nome, cargo_id, ativo)
SELECT
  'and.0381@gmail.com',
  'André Teixeira Rocha',
  (SELECT id FROM public.cargos WHERE slug = 'lider-producao'),
  true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.usuarios WHERE LOWER(TRIM(email)) = 'and.0381@gmail.com'
 );

-- 5c · garante cargo (se o registro ja existia)
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-producao'),
       ativo = true
 WHERE LOWER(TRIM(email)) = 'and.0381@gmail.com';

-- 5d · area Produção
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'and.0381@gmail.com'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) IN ('produção', 'producao') LIMIT 1),
  true
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'and.0381@gmail.com') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas
      WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'and.0381@gmail.com')
        AND area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) IN ('produção', 'producao') LIMIT 1)
   );

-- ─────────────────────────────────────────────────────────────────────
-- Passo 6 · Desativa Eliza Santos (se existir)
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET ativo = false
 WHERE LOWER(nome) LIKE '%eliza santos%'
    OR LOWER(email) LIKE '%eliza%';

UPDATE public.profiles
   SET active = false
 WHERE LOWER(name) LIKE '%eliza santos%'
    OR LOWER(email) LIKE '%eliza%';

-- ─────────────────────────────────────────────────────────────────────
-- Conferencia (descomente):
-- SELECT u.email, u.nome, c.slug AS cargo,
--        array_agg(a.nome ORDER BY a.nome) AS areas
--   FROM usuarios u
--   LEFT JOIN cargos c ON c.id = u.cargo_id
--   LEFT JOIN usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN areas a ON a.id = ua.area_id
--  WHERE LOWER(u.email) IN (
--    'pepe.menezes@cbrio.org', 'david.sicon@cbrio.org',
--    'pedro.paiva@cbrio.org', 'pedro.fernandes@cbrio.org',
--    'renata.martins@cbrio.org', 'and.0381@gmail.com',
--    'lorena.pariz@cbrio.org', 'caua.pedreti@cbrio.org',
--    'allan.santana@cbrio.org', 'leticia.baldner@cbrio.org'
--  )
--  GROUP BY u.email, u.nome, c.slug ORDER BY c.slug, u.email;
