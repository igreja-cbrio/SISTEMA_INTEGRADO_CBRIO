-- ============================================================================
-- Fix da migration 20260520120000 · cargos nao tem unique em slug
-- ============================================================================
-- Erro: "no unique or exclusion constraint matching the ON CONFLICT
-- specification" porque public.cargos so tem UNIQUE em (nome), nao em (slug).
--
-- Esta versao usa NOT EXISTS pra ser idempotente sem precisar de constraint.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Cria 3 cargos novos (NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-adoracao', 'Coord Ador', 'Coordenador de Adoração', 'David Sicon', 115, 'coordenacao', 'Coordenador de Adoração/Louvor · responde ao Diretor Criativo', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-adoracao');

INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-producao', 'Coord Prod', 'Coordenador de Produção', 'Pedro Fernandes', 117, 'coordenacao', 'Coordenador de Produção · responde ao Diretor Criativo', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-producao');

INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'coordenador-online', 'Coord Onl', 'Coordenador de Online (Cultos)', 'Renata Martins', 118, 'coordenacao', 'Coordenador de Online · staff de culto · responde ao Diretor Criativo', 3, 3, true
 WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'coordenador-online');

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Matriz dos 3 cargos novos · copia do coordenador-marketing
--   (cargo_modulo_permissao TEM unique em (cargo_id, modulo_id) entao
--    ON CONFLICT funciona aqui)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE base_cargo_id int;
BEGIN
  SELECT id INTO base_cargo_id FROM public.cargos WHERE slug = 'coordenador-marketing';
  IF base_cargo_id IS NULL THEN
    RAISE EXCEPTION 'coordenador-marketing nao encontrado';
  END IF;

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
-- Passo 3 · Atribui cargos aos titulares
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
-- ─────────────────────────────────────────────────────────────────────

-- David Sicon · so Louvor
DELETE FROM public.usuario_areas
 WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org')
   AND area_id != (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'louvor' LIMIT 1);
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org'),
  (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'louvor' LIMIT 1),
  true
 WHERE (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas
      WHERE usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(email) = 'david.sicon@cbrio.org')
        AND area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'louvor' LIMIT 1)
   );

-- ─────────────────────────────────────────────────────────────────────
-- Passo 5 · Andre Rocha (and.0381@gmail.com)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.mem_membros (nome, email, status, active)
SELECT 'André Teixeira Rocha', 'and.0381@gmail.com', 'membro_ativo', true
 WHERE NOT EXISTS (SELECT 1 FROM public.mem_membros WHERE LOWER(TRIM(email)) = 'and.0381@gmail.com');

INSERT INTO public.usuarios (email, nome, cargo_id, ativo)
SELECT 'and.0381@gmail.com', 'André Teixeira Rocha',
       (SELECT id FROM public.cargos WHERE slug = 'lider-producao'), true
 WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE LOWER(TRIM(email)) = 'and.0381@gmail.com');

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-producao'),
       ativo = true
 WHERE LOWER(TRIM(email)) = 'and.0381@gmail.com';

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
-- Passo 6 · Desativa Eliza Santos
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios SET ativo = false
 WHERE LOWER(nome) LIKE '%eliza santos%' OR LOWER(email) LIKE '%eliza%';
UPDATE public.profiles SET active = false
 WHERE LOWER(name) LIKE '%eliza santos%' OR LOWER(email) LIKE '%eliza%';
