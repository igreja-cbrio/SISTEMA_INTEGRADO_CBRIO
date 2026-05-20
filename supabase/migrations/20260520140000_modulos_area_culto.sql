-- ============================================================================
-- 3 modulos novos · areas de culto (kids, ami, bridge)
-- ============================================================================
-- Marcos: "Quero criar Kids, AMI e Bridge no padrao do Online · drill-down
-- de indicadores por area de culto. Sede e CBA nao precisam".
--
-- Os 3 modulos sao read-only · preenchimento continua via /integracao.
-- Matriz default = copia da matriz do modulo `online` (que tambem eh
-- read-only · mesmo padrao de cargo × modulo).
-- AREA_MODULO_BOOST estendido em backend/middleware/auth.js · pessoas com
-- area "KIDS"/"AMI"/"Bridge" ganham nivel 5 no modulo correspondente.
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Cria os 3 modulos
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'kids', 'CBKids', '/ministerial/kids', 'ministerial', 131,
       'Indicadores de CBKids (read-only) · preencher via Integracao', true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'kids');

INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'ami', 'AMI', '/ministerial/ami', 'ministerial', 132,
       'Indicadores AMI (read-only) · preencher via Integracao', true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'ami');

INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'bridge', 'Bridge', '/ministerial/bridge', 'ministerial', 133,
       'Indicadores Bridge (read-only) · preencher via Integracao', true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'bridge');

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Matriz default · copia do modulo `online` (mesmo padrao)
-- Aplica pra cada cargo ja existente, pra cada modulo novo
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'online';
  IF base_modulo_id IS NULL THEN
    RAISE EXCEPTION 'modulo `online` nao encontrado · seed inicial nao rodou?';
  END IF;

  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_modulo_id
     AND novo.slug IN ('kids', 'ami', 'bridge')
  ON CONFLICT (cargo_id, modulo_id) DO UPDATE
     SET nivel = EXCLUDED.nivel,
         pode_exportar = EXCLUDED.pode_exportar,
         pode_aprovar = EXCLUDED.pode_aprovar,
         escopo_proprio = EXCLUDED.escopo_proprio,
         updated_at = now();
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Conferencia:
-- SELECT m.slug, count(cmp.*) AS celulas
--   FROM modulos m
--   LEFT JOIN cargo_modulo_permissao cmp ON cmp.modulo_id = m.id
--  WHERE m.slug IN ('kids', 'ami', 'bridge')
--  GROUP BY m.slug;
-- Esperado: 3 linhas, cada uma com mesmo numero de celulas que `online`.
