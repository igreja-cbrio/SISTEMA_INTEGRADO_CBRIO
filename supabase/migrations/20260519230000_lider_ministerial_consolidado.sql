-- ============================================================================
-- Consolidacao · cargo `lider-ministerial` + atribuicao Alda Lorena
-- ============================================================================
-- Idempotente. Pode rodar quantas vezes precisar.
--
-- O que faz:
-- 1. Aplica TODOS os ajustes ja decididos pra matriz cargo `lider-ministerial`
--    (substitui as migrations 20260519160000 + 20260519180000 caso uma
--    delas tenha ficado pendente).
-- 2. Garante que a Alda Lorena tenha cargo `lider-ministerial` em `usuarios`
--    (assume que ja existe em usuarios via sync 20260519210000).
-- 3. Atribui area `Integração` pra Alda (idempotente).
--
-- Niveis finais aplicados pro cargo lider-ministerial:
--   gestao        = 0  (sem acesso · ela nao precisa de PMO)
--   ritual        = 0  (so diretoria geral)
--   online        = 1  (so leitura · modulo eh somente leitura per design)
--   grupos        = 1  (so leitura · supervisao do ministerio dela)
--   cuidados      = 1  (ve sem editar)
--   voluntariado  = 5  (admin do time dela)
--   nps           = 5  (cria pesquisas, analisa)
--   projetos      = 3 + escopo_proprio  (so projetos onde ela e' leader)
-- ============================================================================

-- Passo 1 · matriz
WITH cargo AS (
  SELECT id FROM public.cargos WHERE slug = 'lider-ministerial'
)
UPDATE public.cargo_modulo_permissao cmp
   SET nivel = ajustes.novo_nivel,
       pode_exportar  = ajustes.exp,
       pode_aprovar   = ajustes.apr,
       escopo_proprio = ajustes.esc,
       updated_at = now()
  FROM (VALUES
    ('gestao',       0, false, false, false),
    ('ritual',       0, false, false, false),
    ('online',       1, false, false, false),
    ('grupos',       1, false, false, false),
    ('cuidados',     1, false, false, false),
    ('voluntariado', 5, false, false, false),
    ('nps',          5, false, false, false),
    ('projetos',     3, false, false, true)
  ) AS ajustes(modulo_slug, novo_nivel, exp, apr, esc)
  JOIN public.modulos m ON m.slug = ajustes.modulo_slug
 WHERE cmp.cargo_id = (SELECT id FROM cargo)
   AND cmp.modulo_id = m.id;

-- Passo 2 · garante registro da Alda em usuarios com cargo lider-ministerial
-- (caso o sync 20260519210000 tenha colocado ela como `membro` por default)
DO $$
DECLARE
  alda_email text;
  cargo_id_target int;
BEGIN
  SELECT id INTO cargo_id_target FROM public.cargos WHERE slug = 'lider-ministerial';

  -- Tenta achar email da Alda nos profiles (LIKE pra tolerar variacao)
  SELECT LOWER(TRIM(email)) INTO alda_email
    FROM public.profiles
   WHERE active = true
     AND (LOWER(name) LIKE '%alda lorena%' OR LOWER(email) LIKE '%alda%')
   ORDER BY (LOWER(name) LIKE '%alda lorena%') DESC, length(name) ASC
   LIMIT 1;

  IF alda_email IS NULL THEN
    RAISE NOTICE 'Alda nao encontrada em profiles · pulando atribuicao de cargo';
    RETURN;
  END IF;

  -- Atualiza cargo se ja existe em usuarios
  UPDATE public.usuarios
     SET cargo_id = cargo_id_target
   WHERE LOWER(TRIM(email)) = alda_email;

  RAISE NOTICE 'Alda (email=%) atribuida ao cargo lider-ministerial', alda_email;
END $$;

-- Passo 3 · area Integracao pra Alda (idempotente · so se nao tiver ja)
DO $$
DECLARE
  alda_usuario_id int;
  integracao_area_id int;
BEGIN
  -- Pega usuario_id da Alda (mesma logica do passo 2)
  SELECT u.id INTO alda_usuario_id
    FROM public.usuarios u
    JOIN public.profiles p ON LOWER(p.email) = LOWER(u.email)
   WHERE p.active = true
     AND (LOWER(p.name) LIKE '%alda lorena%' OR LOWER(p.email) LIKE '%alda%')
   ORDER BY (LOWER(p.name) LIKE '%alda lorena%') DESC
   LIMIT 1;

  -- Pega area Integracao
  SELECT id INTO integracao_area_id
    FROM public.areas
   WHERE LOWER(nome) LIKE '%integra%'
     AND ativo = true
   LIMIT 1;

  IF alda_usuario_id IS NULL OR integracao_area_id IS NULL THEN
    RAISE NOTICE 'Alda ou area Integracao nao encontradas · pulando area';
    RETURN;
  END IF;

  INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
  SELECT alda_usuario_id, integracao_area_id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usuario_areas
     WHERE usuario_id = alda_usuario_id AND area_id = integracao_area_id
  );

  RAISE NOTICE 'Alda associada a area Integracao';
END $$;

-- Conferencia (descomente no Studio):
-- SELECT u.email, c.slug AS cargo, a.nome AS area
--   FROM usuarios u
--   LEFT JOIN cargos c ON c.id = u.cargo_id
--   LEFT JOIN usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN areas a ON a.id = ua.area_id
--  WHERE LOWER(u.email) LIKE '%alda%';
--
-- SELECT m.slug, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
--   FROM cargo_modulo_permissao cmp
--   JOIN cargos c ON c.id = cmp.cargo_id
--   JOIN modulos m ON m.id = cmp.modulo_id
--  WHERE c.slug = 'lider-ministerial'
--    AND m.slug IN ('gestao','ritual','online','grupos','cuidados','voluntariado','nps','projetos')
--  ORDER BY m.slug;
