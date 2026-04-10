-- ================================================================
-- CONFIGURAÇÃO DE PERMISSÕES DE MÓDULO — CBRio ERP
-- Rode este arquivo no Supabase SQL Editor.
--
-- Regras aplicadas:
--   Acesso admin    → role 'admin'   + TODOS os módulos, nível 5/5
--   Acesso diretor  → role 'diretor' + TODOS os módulos, nível 4/4
--   Acesso líder    → apenas módulo da área cadastrada, nível 3/2
--   Acesso assistente → apenas módulo da área cadastrada, nível 2/1
--   Acesso negado   → nenhum módulo
-- ================================================================


-- ----------------------------------------------------------------
-- PASSO 1: Corrigir o role no profiles para admin/diretor
-- (necessário para os checks de authorize() no backend)
-- ----------------------------------------------------------------
UPDATE profiles
SET role = 'admin'
WHERE email IN (
  SELECT p.email
  FROM usuarios u
  JOIN profiles p ON p.email = u.email
  JOIN cargos c ON c.id = u.cargo_id
  WHERE c.nome = 'Acesso admin' AND u.ativo = true
);

UPDATE profiles
SET role = 'diretor'
WHERE email IN (
  SELECT p.email
  FROM usuarios u
  JOIN profiles p ON p.email = u.email
  JOIN cargos c ON c.id = u.cargo_id
  WHERE c.nome = 'Acesso diretor' AND u.ativo = true
);


-- ----------------------------------------------------------------
-- PASSO 2: Limpar todos os overrides existentes e recriar do zero
-- ----------------------------------------------------------------
DELETE FROM permissoes_modulo
WHERE usuario_id IN (
  SELECT id FROM usuarios WHERE ativo = true
);


-- ----------------------------------------------------------------
-- PASSO 3: Acesso admin → TODOS os módulos, nível 5
-- (Matheus, Marcos Paulo, Diego e qualquer outro com esse cargo)
-- ----------------------------------------------------------------
INSERT INTO permissoes_modulo (usuario_id, modulo_id, nivel_leitura, nivel_escrita)
SELECT u.id, m.id, 5, 5
FROM usuarios u
JOIN cargos c ON c.id = u.cargo_id
CROSS JOIN modulos m
WHERE u.ativo = true
  AND c.nome = 'Acesso admin'
  AND m.ativo = true;


-- ----------------------------------------------------------------
-- PASSO 4: Acesso diretor → TODOS os módulos, nível 4
-- ----------------------------------------------------------------
INSERT INTO permissoes_modulo (usuario_id, modulo_id, nivel_leitura, nivel_escrita)
SELECT u.id, m.id, 4, 4
FROM usuarios u
JOIN cargos c ON c.id = u.cargo_id
CROSS JOIN modulos m
WHERE u.ativo = true
  AND c.nome = 'Acesso diretor'
  AND m.ativo = true;


-- ----------------------------------------------------------------
-- PASSO 5: Acesso líder com área → módulo correspondente, nível 3/2
-- (Ex: Yago → área "Financeiro" → módulo "Financeiro", leitura 3)
-- ----------------------------------------------------------------
INSERT INTO permissoes_modulo (usuario_id, modulo_id, nivel_leitura, nivel_escrita)
SELECT DISTINCT ua.usuario_id, m.id, 3, 2
FROM usuario_areas ua
JOIN areas a ON a.id = ua.area_id
JOIN usuarios u ON u.id = ua.usuario_id
JOIN cargos c ON c.id = u.cargo_id
JOIN modulos m ON (
    (a.nome ILIKE '%financ%'      AND m.nome = 'Financeiro')
 OR (a.nome ILIKE '%rh%'         AND m.nome IN ('DP', 'Pessoas'))
 OR (a.nome ILIKE '%recursos%'   AND m.nome IN ('DP', 'Pessoas'))
 OR (a.nome ILIKE '%pessoas%'    AND m.nome IN ('DP', 'Pessoas'))
 OR (a.nome ILIKE '%logistic%'   AND m.nome = 'Logística')
 OR (a.nome ILIKE '%compras%'    AND m.nome = 'Logística')
 OR (a.nome ILIKE '%patrimoni%'  AND m.nome = 'Patrimônio')
 OR (a.nome ILIKE '%ti%'         AND m.nome = 'TI')
 OR (a.nome ILIKE '%tecnolog%'   AND m.nome = 'TI')
 OR (a.nome ILIKE '%membresia%'  AND m.nome = 'Membresia')
 OR (a.nome ILIKE '%marketing%'  AND m.nome = 'Comunicação')
 OR (a.nome ILIKE '%criativo%'   AND m.nome = 'Comunicação')
 OR (a.nome ILIKE '%eventos%'    AND m.nome = 'Agenda')
 OR (a.nome ILIKE '%agenda%'     AND m.nome = 'Agenda')
 OR (a.nome ILIKE '%projeto%'    AND m.nome IN ('Projetos', 'Tarefas'))
 OR (a.nome ILIKE '%expansao%'   AND m.nome IN ('Projetos', 'Tarefas'))
)
WHERE u.ativo = true
  AND c.nome = 'Acesso líder'
  AND m.ativo = true;


-- ----------------------------------------------------------------
-- PASSO 6: Acesso assistente com área → módulo correspondente, nível 2/1
-- ----------------------------------------------------------------
INSERT INTO permissoes_modulo (usuario_id, modulo_id, nivel_leitura, nivel_escrita)
SELECT DISTINCT ua.usuario_id, m.id, 2, 1
FROM usuario_areas ua
JOIN areas a ON a.id = ua.area_id
JOIN usuarios u ON u.id = ua.usuario_id
JOIN cargos c ON c.id = u.cargo_id
JOIN modulos m ON (
    (a.nome ILIKE '%financ%'      AND m.nome = 'Financeiro')
 OR (a.nome ILIKE '%rh%'         AND m.nome IN ('DP', 'Pessoas'))
 OR (a.nome ILIKE '%recursos%'   AND m.nome IN ('DP', 'Pessoas'))
 OR (a.nome ILIKE '%pessoas%'    AND m.nome IN ('DP', 'Pessoas'))
 OR (a.nome ILIKE '%logistic%'   AND m.nome = 'Logística')
 OR (a.nome ILIKE '%compras%'    AND m.nome = 'Logística')
 OR (a.nome ILIKE '%patrimoni%'  AND m.nome = 'Patrimônio')
 OR (a.nome ILIKE '%ti%'         AND m.nome = 'TI')
 OR (a.nome ILIKE '%tecnolog%'   AND m.nome = 'TI')
 OR (a.nome ILIKE '%membresia%'  AND m.nome = 'Membresia')
 OR (a.nome ILIKE '%marketing%'  AND m.nome = 'Comunicação')
 OR (a.nome ILIKE '%criativo%'   AND m.nome = 'Comunicação')
 OR (a.nome ILIKE '%eventos%'    AND m.nome = 'Agenda')
 OR (a.nome ILIKE '%agenda%'     AND m.nome = 'Agenda')
 OR (a.nome ILIKE '%projeto%'    AND m.nome IN ('Projetos', 'Tarefas'))
)
WHERE u.ativo = true
  AND c.nome = 'Acesso assistente'
  AND m.ativo = true;


-- ----------------------------------------------------------------
-- VERIFICAÇÃO FINAL — rode após os INSERTs para conferir
-- ----------------------------------------------------------------
SELECT
  p.name,
  p.role,
  c.nome  AS cargo,
  STRING_AGG(m.nome || ' (L:' || pm.nivel_leitura || '/E:' || pm.nivel_escrita || ')', ', ' ORDER BY m.nome) AS modulos
FROM permissoes_modulo pm
JOIN usuarios u ON u.id = pm.usuario_id
JOIN profiles p ON p.email = u.email
JOIN cargos c    ON c.id  = u.cargo_id
JOIN modulos m   ON m.id  = pm.modulo_id
GROUP BY p.name, p.role, c.nome
ORDER BY c.nome, p.name;
