-- ============================================================================
-- Módulo dedicado "Batismo" · acesso ISOLADO (2026-06-25)
--
-- Contexto: alguns voluntários precisam acessar o sistema com escopo mínimo.
-- O responsável de batismo (ex.: Marcelo Ricart) deve operar APENAS a gestão
-- de batismo — nenhuma outra aba. Hoje a gestão de batismo é a aba "Batismos"
-- de DENTRO da Integração; dar acesso significava abrir a Integração inteira
-- (Cultos/Frequência/Decisões/Histórico).
--
-- Esta migration cria um módulo próprio `batismo` (rota /batismo, que no front
-- monta só a tela <Batismos/>) + um cargo `responsavel-batismo` com nível 3
-- SÓ nesse módulo (0 em todo o resto, por ausência → fallback da
-- vw_permissao_efetiva). O backend ganha um guard `authorizeBatismo` dedicado
-- (só nos endpoints /kpis/batismos*), então o acesso fica isolado na URL E nos
-- endpoints — o cargo não escreve em cultos/decisões.
--
-- Aditiva e idempotente. Não altera nenhuma permissão existente.
-- ============================================================================

-- 1. Catálogo de módulos · novo módulo batismo
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'batismo', 'Batismo', '/batismo', 'ministerial', 999,
       'Gestão de batismo (inscrições, horários, agendamento, check-in) · acesso isolado',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'batismo');

-- 2. Cargo dedicado · responsável de batismo (escopo mínimo)
-- nivel_padrao_* = 1 porque o CHECK proíbe 0 — mas NÃO é piso de acesso:
-- resolveEffectivePerms ignora nivel_padrao; o acesso vem só da matriz
-- (cargo_modulo_permissao). Matriz com só a linha batismo=3 → 0 no resto.
INSERT INTO public.cargos (slug, nome, nome_completo, categoria, descricao, ativo, ordem,
                           nivel_padrao_leitura, nivel_padrao_escrita)
SELECT 'responsavel-batismo', 'Responsável de Batismo', 'Responsável de Batismo',
       'ministerial',
       'Acesso restrito à gestão de batismo · nenhum outro módulo',
       true, 999, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM public.cargos WHERE slug = 'responsavel-batismo');

-- 3. Matriz · o cargo responsavel-batismo recebe nível 3 (CRUD) SÓ no módulo
--    batismo. Demais módulos ficam em 0 por ausência de linha (fallback da view).
INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT c.id, m.id, 3, false, false, false
  FROM public.cargos c
  CROSS JOIN public.modulos m
 WHERE c.slug = 'responsavel-batismo'
   AND m.slug = 'batismo'
ON CONFLICT (cargo_id, modulo_id) DO UPDATE SET nivel = EXCLUDED.nivel;

-- 4. Líderes que já têm Integração também enxergam o módulo Batismo (mesmo nível
--    que têm em integracao), pra quem preferir a tela isolada. Não tira acesso
--    de ninguém; só espelha o nível de integracao no novo módulo batismo.
INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT cmp.cargo_id, mb.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
  FROM public.cargo_modulo_permissao cmp
  JOIN public.modulos mi ON mi.id = cmp.modulo_id AND mi.slug = 'integracao'
  CROSS JOIN public.modulos mb
 WHERE mb.slug = 'batismo'
   AND cmp.nivel > 0
ON CONFLICT (cargo_id, modulo_id) DO NOTHING;

COMMENT ON COLUMN public.modulos.slug IS 'Identificador técnico do módulo (sem acento). batismo = gestão isolada de batismo (rota /batismo).';
