-- ============================================================================
-- Permissões · regra ÚNICA de precedência (override soberano) · 2026-06-25
-- ----------------------------------------------------------------------------
-- Núcleo do conserto do módulo de permissões (decisão do Marcos): "cargo manda,
-- override é a exceção que vence". Espelha no banco a MESMA regra do backend
-- (resolveEffectivePerms em backend/middleware/auth.js):
--
--   1. super-admin → 5
--   2. se há override (permissoes_modulo, não expirado) no módulo → o OVERRIDE
--      VENCE (0–5; 0 = sem acesso). A área NÃO entra quando há override.
--   3. senão → acesso base = MAIOR entre o nível do cargo e o boost da área.
--
-- ANTES: a área fazia GREATEST(nivel, 5) DEPOIS do override e o engolia — não
-- dava pra rebaixar, por pessoa, um módulo concedido pela área (só com nível 0,
-- por um caminho separado/modulosBloqueados). Agora o override é soberano.
--
-- Também adiciona 'producao' à lista de boost por área — estava no backend
-- (AREA_MODULO_BOOST) mas faltava aqui (divergência API × RLS).
--
-- Idempotente: CREATE OR REPLACE FUNCTION. NÃO altera dados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_module_level(p_module_slug TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID; v_user_email TEXT; v_modulo_id UUID;
  v_nivel INTEGER := 0; v_override INTEGER; v_default INTEGER;
  v_areas_normalizadas TEXT[];
BEGIN
  IF public.is_super_admin() THEN RETURN 5; END IF;

  SELECT au.email INTO v_user_email FROM auth.users au WHERE au.id = auth.uid();
  IF v_user_email IS NULL THEN RETURN 0; END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u
  WHERE LOWER(u.email) = LOWER(v_user_email) AND u.ativo = true LIMIT 1;
  IF v_user_id IS NULL THEN RETURN 0; END IF;

  SELECT m.id INTO v_modulo_id FROM public.modulos m
  WHERE m.slug = p_module_slug AND m.ativo = true LIMIT 1;
  IF v_modulo_id IS NULL THEN RETURN 0; END IF;

  -- 1. OVERRIDE SOBERANO · se existe override (não expirado), ele decide. FIM.
  --    (incl. 0 = sem acesso · a área não entra quando há override.)
  SELECT GREATEST(COALESCE(pm.nivel_leitura, 0), COALESCE(pm.nivel_escrita, 0))
    INTO v_override
  FROM public.permissoes_modulo pm
  WHERE pm.usuario_id = v_user_id AND pm.modulo_id = v_modulo_id
    AND (pm.expira_em IS NULL OR pm.expira_em > now())
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  -- 2. Sem override → base = nível do cargo.
  SELECT cmp.nivel INTO v_default
  FROM public.usuarios u
  JOIN public.cargo_modulo_permissao cmp ON cmp.cargo_id = u.cargo_id
  WHERE u.id = v_user_id AND cmp.modulo_id = v_modulo_id LIMIT 1;
  v_nivel := COALESCE(v_default, 0);

  -- 3. Boost por área (SÓ quando não há override) · 'producao' incluído (paridade c/ backend).
  IF p_module_slug IN ('kids','ami','bridge','online','cuidados',
                        'grupos','integracao','voluntariado','next',
                        'marketing','producao') THEN
    SELECT ARRAY_AGG(LOWER(unaccent(a.nome))) INTO v_areas_normalizadas
    FROM public.usuario_areas ua
    JOIN public.areas a ON a.id = ua.area_id
    WHERE ua.usuario_id = v_user_id;

    IF v_areas_normalizadas IS NOT NULL
       AND p_module_slug = ANY(v_areas_normalizadas) THEN
      v_nivel := GREATEST(v_nivel, 5);
    END IF;
  END IF;

  RETURN v_nivel;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_module_level(TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.current_user_module_level(TEXT) IS
  'Nível efetivo (0-5) do usuário logado no módulo. Regra única (2026-06-25): '
  'super-admin=5; senão override soberano (se houver, vence cargo+área, incl. 0); '
  'senão MAIOR entre cargo e boost de área. Espelha resolveEffectivePerms (backend).';
