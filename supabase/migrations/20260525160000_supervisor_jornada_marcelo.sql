-- =====================================================================
-- Cargo · supervisor-jornada (Marcelo Soares · 2026-05-25)
-- =====================================================================
-- Marcelo Soares era "Assistente Ministerio Cuidados" e passa a ser
-- SUPERVISOR DE JORNADA · callback de cuidado pastoral que VE e PREENCHE
-- dados de jornada (5 valores · 6 areas) em TODOS os ministerios.
--
-- Conceito · ele e a rede de seguranca · se um lider esqueceu de marcar
-- decisao, batismo, devocional ou checkin, Marcelo entra, corrige e
-- mantem o NSM saudavel. NAO substitui os lideres · soma com eles.
--
-- Diferenca pro `assistente-ministerial` original:
--   - SEM escopo_proprio nos modulos da jornada
--   - VE e PREENCHE de TODAS as 6 areas (kids/ami/bridge/sede/online/cba)
--   - nivel 3 (CRUD) nos modulos relevantes a jornada
--   - mantem nivel 0/1 em modulos administrativos (RH, financeiro, etc)
--
-- Idempotente · pode rodar quantas vezes precisar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Criar o cargo novo
-- ---------------------------------------------------------------------
INSERT INTO public.cargos (
  slug, nome, nome_completo, titular_sugerido, ordem, categoria,
  descricao, nivel_padrao_leitura, nivel_padrao_escrita
) VALUES (
  'supervisor-jornada',
  'Supervisor Jornada',
  'Supervisor de Jornada',
  'Marcelo Soares',
  95,
  'supervisao',
  'Callback de jornada · ve e preenche dados de TODAS as areas (kids/ami/bridge/sede/online/cba) e valores (seguir/conectar/investir/servir/generosidade). Nao substitui os lideres · entra como rede de seguranca pra corrigir lacunas que possam afetar o NSM.',
  3, 3
)
ON CONFLICT (nome) DO UPDATE SET
  slug = EXCLUDED.slug,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  nivel_padrao_leitura = EXCLUDED.nivel_padrao_leitura,
  nivel_padrao_escrita = EXCLUDED.nivel_padrao_escrita,
  ativo = true;

-- ---------------------------------------------------------------------
-- 2. Seedar matriz cargo_modulo_permissao
-- ---------------------------------------------------------------------
-- Filosofia:
--   - Modulos da jornada (cuidados, integracao, membresia, grupos,
--     voluntariado, next, dados-brutos, kids, ami, bridge, online) ·
--     nivel 3 SEM escopo_proprio (ve todas as areas)
--   - Painel CBRio · nivel 1 (leitura · NSM, mandalas, matriz)
--   - Minha area · nivel 3 sem escopo
--   - Dashboard, eventos, projetos, expansao, planejamento · nivel 1
--   - NPS · nivel 2 (preenche)
--   - Solicitacoes · nivel 2 (abre solicitacao se precisar)
--   - Perfil proprio · nivel 3 (so o seu · escopo_proprio)
--   - IA · nivel 2 (consulta dados)
--   - RH, financeiro, logistica, patrimonio · 0 (nao envolve jornada)
--   - Gestao, governanca, ritual, revisao-estrategica · 0 (diretoria)
--   - Admin (permissoes, usuarios, notificacoes-config, cerebro) · 0

DELETE FROM public.cargo_modulo_permissao
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'supervisor-jornada');

WITH dados(modulo_slug, nivel, exportar, aprovar, escopo) AS (VALUES
  -- Estrategica
  ('dashboard',            1, false, false, false),
  ('painel-cbrio',         1, false, false, false),
  ('minha-area',           3, false, false, false),
  ('gestao',               0, false, false, false),
  ('planejamento',         0, false, false, false),
  ('ritual',               0, false, false, false),
  ('governanca',           0, false, false, false),
  ('revisao-estrategica',  0, false, false, false),

  -- Ministerial · CORACAO do papel (todas SEM escopo)
  ('integracao',           3, false, false, false),
  ('cuidados',             3, false, false, false),
  ('online',               3, false, false, false),
  ('kids',                 3, false, false, false),
  ('ami',                  3, false, false, false),
  ('bridge',               3, false, false, false),
  ('next',                 3, false, false, false),
  ('voluntariado',         3, false, false, false),
  ('membresia',            3, false, false, false),
  ('grupos',               3, false, false, false),

  -- Operacional
  ('eventos',              1, false, false, false),
  ('projetos',             1, false, false, false),
  ('expansao',             1, false, false, false),
  ('rh',                   0, false, false, false),
  ('financeiro',           0, false, false, false),
  ('logistica',            0, false, false, false),
  ('patrimonio',           0, false, false, false),
  ('solicitacoes',         2, false, false, false),

  -- Dados / IA / Admin
  ('dados-brutos',         3, false, false, false),  -- preenche TODAS areas
  ('nps',                  2, false, false, false),
  ('notificacoes-config',  0, false, false, false),
  ('assistente-ia',        2, false, false, false),
  ('cerebro',              0, false, false, false),
  ('perfil',               3, false, false, true),
  ('permissoes-admin',     0, false, false, false),
  ('usuarios-admin',       0, false, false, false)
)
INSERT INTO public.cargo_modulo_permissao
  (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT
  (SELECT id FROM public.cargos WHERE slug = 'supervisor-jornada'),
  m.id,
  d.nivel,
  d.exportar,
  d.aprovar,
  d.escopo
  FROM dados d
  JOIN public.modulos m ON m.slug = d.modulo_slug
 WHERE m.ativo = true
ON CONFLICT (cargo_id, modulo_id) DO UPDATE SET
  nivel = EXCLUDED.nivel,
  pode_exportar = EXCLUDED.pode_exportar,
  pode_aprovar = EXCLUDED.pode_aprovar,
  escopo_proprio = EXCLUDED.escopo_proprio,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 3. Garantir registro do Marcelo em mem_membros (idempotente · ja
--    seedado nas migrations 20260507340000 / 20260507360000, mas
--    defensivo se rodar em outra base)
-- ---------------------------------------------------------------------
INSERT INTO public.mem_membros (nome, email, status, active)
SELECT 'Marcelo Soares', 'marcelo.soares@cbrio.org', 'membro_ativo', true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.mem_membros
    WHERE LOWER(TRIM(nome)) LIKE '%marcelo%soares%'
       OR LOWER(TRIM(email)) = 'marcelo.soares@cbrio.org'
 );

-- ---------------------------------------------------------------------
-- 4. Atribuir o cargo a Marcelo
-- ---------------------------------------------------------------------
-- Caminho A · ja existe usuarios row (auto-provision passou) · UPDATE
UPDATE public.usuarios u
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'supervisor-jornada'),
       ativo = true
 WHERE LOWER(TRIM(u.nome)) LIKE '%marcelo%soares%'
    OR LOWER(TRIM(u.email)) = 'marcelo.soares@cbrio.org';

-- Caminho B · existe profile (sync rodou) mas sem usuarios · CRIAR
INSERT INTO public.usuarios (email, nome, cargo_id, ativo)
SELECT
  LOWER(TRIM(p.email)),
  COALESCE(p.name, 'Marcelo Soares'),
  (SELECT id FROM public.cargos WHERE slug = 'supervisor-jornada'),
  true
  FROM public.profiles p
 WHERE p.active = true
   AND LOWER(p.name) LIKE '%marcelo%soares%'
   AND p.email IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuarios u
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(p.email))
   );

-- Caminho C · nem usuarios nem profile (Marcelo ainda nao logou) ·
-- criar placeholder com email convencional pra que quando ele logar a
-- auto-provision encontre o cargo ja atribuido por email.
INSERT INTO public.usuarios (email, nome, cargo_id, ativo)
SELECT
  'marcelo.soares@cbrio.org',
  'Marcelo Soares',
  (SELECT id FROM public.cargos WHERE slug = 'supervisor-jornada'),
  true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.usuarios
    WHERE LOWER(TRIM(nome)) LIKE '%marcelo%soares%'
       OR LOWER(TRIM(email)) = 'marcelo.soares@cbrio.org'
 );

-- ---------------------------------------------------------------------
-- 5. (Opcional) atribuir TODAS as 6 areas de culto pro Marcelo · garante
--    que ele apareca em filtros por area mesmo quando uma tela usa
--    AREA_MODULO_BOOST + usuario_areas
-- ---------------------------------------------------------------------
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios
    WHERE LOWER(TRIM(nome)) LIKE '%marcelo%soares%'
       OR LOWER(TRIM(email)) = 'marcelo.soares@cbrio.org'
    LIMIT 1),
  a.id,
  false
  FROM public.areas a
 WHERE LOWER(TRIM(a.nome)) IN ('cuidados', 'integracao', 'kids', 'ami', 'bridge', 'online')
   AND (SELECT id FROM public.usuarios
         WHERE LOWER(TRIM(nome)) LIKE '%marcelo%soares%'
            OR LOWER(TRIM(email)) = 'marcelo.soares@cbrio.org'
         LIMIT 1) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas ua
      WHERE ua.usuario_id = (SELECT id FROM public.usuarios
                              WHERE LOWER(TRIM(nome)) LIKE '%marcelo%soares%'
                                 OR LOWER(TRIM(email)) = 'marcelo.soares@cbrio.org'
                              LIMIT 1)
        AND ua.area_id = a.id
   );

COMMIT;

-- ---------------------------------------------------------------------
-- Conferencia (descomente apos rodar pra validar):
--
-- SELECT u.email, u.nome, c.slug AS cargo, c.nome AS cargo_nome,
--        array_agg(DISTINCT a.nome ORDER BY a.nome) AS areas
--   FROM public.usuarios u
--   LEFT JOIN public.cargos c ON c.id = u.cargo_id
--   LEFT JOIN public.usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN public.areas a ON a.id = ua.area_id
--  WHERE LOWER(u.nome) LIKE '%marcelo%soares%'
--     OR LOWER(u.email) = 'marcelo.soares@cbrio.org'
--  GROUP BY u.email, u.nome, c.slug, c.nome;
--
-- Matriz do cargo:
-- SELECT m.slug, m.nome, cmp.nivel, cmp.escopo_proprio
--   FROM public.cargo_modulo_permissao cmp
--   JOIN public.modulos m ON m.id = cmp.modulo_id
--  WHERE cmp.cargo_id = (SELECT id FROM public.cargos WHERE slug = 'supervisor-jornada')
--  ORDER BY m.categoria, m.ordem;
-- ---------------------------------------------------------------------
