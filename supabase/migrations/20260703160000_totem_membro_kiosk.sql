-- ============================================================================
-- Totem Membro · contas de quiosque dos computadores do lounge (2026-07-03)
--
-- Decisão do Marcos: os computadores do hall ganham LOGIN PRÓPRIO que só
-- acessa o Totem Membro. Mecanismo: módulo `totem-membro` com matriz NÃO
-- seedada de propósito (todo cargo fica nível 0) — o acesso vem de OVERRIDE
-- por conta (permissoes_modulo · nível 3). A conta de quiosque tem
-- profiles.is_membro_only = true + acesso a UM único módulo → o login TRAVA
-- em /totem (mecanismo moduloTravado já existente no AuthContext).
-- ============================================================================

-- 1) Módulo no catálogo (aparece na grade de permissões e no menu p/ quem tem)
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'totem-membro', 'Totem Membro', '/totem', 'ministerial', 396,
       'Modo kiosk de autoatendimento do hall (carteirinha, dados, batismo, Next)', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'totem-membro');

-- 2) Cargo das contas de quiosque · matriz TODA zerada (nenhuma linha na
--    cargo_modulo_permissao) — o único acesso vem do override por conta.
--    nivel_padrao_* = 1 porque o CHECK da tabela exige >= 1; é inócuo: o
--    middleware já usa 1 como piso universal (`|| 1`) e nenhum guard real
--    aceita nível 1 pra escrita — quem manda é a matriz vazia + o override.
INSERT INTO public.cargos (slug, nome, nome_completo, descricao, nivel_padrao_leitura, nivel_padrao_escrita, ativo)
SELECT 'totem-kiosk', 'Totem (quiosque)', 'Conta de quiosque · Totem Membro',
       'Conta dedicada dos computadores do lounge. Sem matriz: acesso só por override no módulo totem-membro.',
       1, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'totem-kiosk');

-- 3) dev = nível 5 no módulo novo (a matriz do cargo dev foi seedada antes
--    deste módulo existir e não o cobre automaticamente)
INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT c.id, m.id, 5, false, false, false
FROM public.cargos c, public.modulos m
WHERE c.slug = 'dev' AND m.slug = 'totem-membro'
ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
