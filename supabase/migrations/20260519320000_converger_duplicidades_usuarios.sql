-- ============================================================================
-- Converge duplicidades em `usuarios`
-- ============================================================================
-- Auditoria de 2026-05-19 mostrou 2 categorias de duplicacao:
--
-- 1. Pessoas com 1 registro "rico" (email + cargo + areas) + 1 "lixo"
--    (email=null, cargo=null, sem areas). O lixo provavelmente veio de
--    seed antigo. Apagamos o lixo.
--
-- 2. Matheus tem 4 emails. Decisao do Marcos: manter
--    `matheus.toscano@cbrio.org` (tem 6 areas Gestao) e apagar os outros
--    3 (matheus@cbrio.com.br, matheus.toscano@cbrio.com.br,
--    matheus.toscano@outlook.com).
--
-- Idempotente · so apaga quem tem padrao "lixo".
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Garante que matheus.toscano@cbrio.org tem cargo
--    diretor-administrativo (ele tinha as 6 areas Gestao na auditoria)
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'diretor-administrativo')
 WHERE LOWER(TRIM(email)) = 'matheus.toscano@cbrio.org'
   AND cargo_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Apaga registros LIXO (sem email · sem cargo · sem areas)
-- Filtro: email IS NULL E cargo_id IS NULL E nao tem entrada em
-- usuario_areas (NULL_safety: nao apaga ninguem com vinculacao real)
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM public.usuarios u
 WHERE (u.email IS NULL OR TRIM(u.email) = '')
   AND u.cargo_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.usuario_areas ua WHERE ua.usuario_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM public.permissoes_modulo pm WHERE pm.usuario_id = u.id);

-- ─────────────────────────────────────────────────────────────────────
-- Passo 3 · Apaga emails redundantes do Matheus
-- (matheus.toscano@cbrio.org e' o registro canonico)
-- ─────────────────────────────────────────────────────────────────────
-- Move qualquer area que esteja nesses registros pro canonico (defensivo)
WITH canonico AS (
  SELECT id FROM public.usuarios WHERE LOWER(TRIM(email)) = 'matheus.toscano@cbrio.org' LIMIT 1
),
duplicatas AS (
  SELECT id FROM public.usuarios
   WHERE LOWER(TRIM(email)) IN (
     'matheus@cbrio.com.br',
     'matheus.toscano@cbrio.com.br',
     'matheus.toscano@outlook.com'
   )
)
UPDATE public.usuario_areas ua
   SET usuario_id = (SELECT id FROM canonico)
  FROM duplicatas d
 WHERE ua.usuario_id = d.id
   AND (SELECT id FROM canonico) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas ua2
      WHERE ua2.usuario_id = (SELECT id FROM canonico)
        AND ua2.area_id = ua.area_id
   );

-- Move overrides tambem
WITH canonico AS (
  SELECT id FROM public.usuarios WHERE LOWER(TRIM(email)) = 'matheus.toscano@cbrio.org' LIMIT 1
),
duplicatas AS (
  SELECT id FROM public.usuarios
   WHERE LOWER(TRIM(email)) IN (
     'matheus@cbrio.com.br',
     'matheus.toscano@cbrio.com.br',
     'matheus.toscano@outlook.com'
   )
)
UPDATE public.permissoes_modulo pm
   SET usuario_id = (SELECT id FROM canonico)
  FROM duplicatas d
 WHERE pm.usuario_id = d.id
   AND (SELECT id FROM canonico) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.permissoes_modulo pm2
      WHERE pm2.usuario_id = (SELECT id FROM canonico)
        AND pm2.modulo_id = pm.modulo_id
   );

-- Apaga FKs residuais (caso houvesse conflito de unique no UPDATE acima)
DELETE FROM public.usuario_areas
 WHERE usuario_id IN (
   SELECT id FROM public.usuarios
    WHERE LOWER(TRIM(email)) IN (
      'matheus@cbrio.com.br',
      'matheus.toscano@cbrio.com.br',
      'matheus.toscano@outlook.com'
    )
 );
DELETE FROM public.permissoes_modulo
 WHERE usuario_id IN (
   SELECT id FROM public.usuarios
    WHERE LOWER(TRIM(email)) IN (
      'matheus@cbrio.com.br',
      'matheus.toscano@cbrio.com.br',
      'matheus.toscano@outlook.com'
    )
 );

-- Apaga os 3 registros redundantes
DELETE FROM public.usuarios
 WHERE LOWER(TRIM(email)) IN (
   'matheus@cbrio.com.br',
   'matheus.toscano@cbrio.com.br',
   'matheus.toscano@outlook.com'
 );

-- Tambem atualiza profile.membro_id desses emails pra apontar pro profile
-- canonico do Matheus, se existir (precaucao)
DO $$
DECLARE
  prof_canonico_id uuid;
BEGIN
  SELECT id INTO prof_canonico_id FROM public.profiles
   WHERE LOWER(TRIM(email)) = 'matheus.toscano@cbrio.org' LIMIT 1;
  IF prof_canonico_id IS NOT NULL THEN
    -- Nenhuma migracao adicional necessaria · profile do canonico ja existe
    RAISE NOTICE 'Profile canonico do Matheus: %', prof_canonico_id;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Conferencia
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  total_matheus int;
  total_sem_email int;
BEGIN
  SELECT count(*) INTO total_matheus FROM public.usuarios
   WHERE LOWER(email) LIKE '%matheus%';
  SELECT count(*) INTO total_sem_email FROM public.usuarios
   WHERE email IS NULL OR TRIM(email) = '';
  RAISE NOTICE 'Registros restantes do Matheus: % · usuarios sem email: %',
    total_matheus, total_sem_email;
END $$;
