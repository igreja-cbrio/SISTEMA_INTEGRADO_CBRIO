-- ============================================================================
-- MIGRATION · Marketing · Seed inicial (Spec 003)
-- ============================================================================
-- 1. Modulo 'marketing' em public.modulos (rota /marketing)
-- 2. Seed matriz cargo_modulo_permissao para o modulo marketing
-- 3. Estende current_user_module_level pra incluir 'marketing' no boost por area
-- 4. Seed marketing_membros (4 confirmados via pre-flight 2026-05-28 · Aline pendente)
-- 5. Seed marketing_compromissos_recorrentes (preliminar · editavel via UI Spec 009)
--
-- Pendencia documentada: Aline (fotografa) sem profile/rh_funcionarios. Pedro
-- ou Marcos cadastra via tela admin (Spec 009) quando souberem o email dela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Modulo marketing em public.modulos
-- ----------------------------------------------------------------------------
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'marketing', 'Marketing', '/marketing', 'ministerial', 390,
       'Gestao de demandas criativas · Kanban + capacidade + analytics. Lider: Pedro Paiva.',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'marketing');

-- ----------------------------------------------------------------------------
-- 2. Seed matriz default (cargo_modulo_permissao) para o modulo marketing
-- ----------------------------------------------------------------------------
-- Niveis seedados conforme 06-seguranca-autorizacao.md secao 3.3:
--   dev (Marcos)                  · 5 + exportar + aprovar
--   coordenador-marketing (Pedro) · 3 base (boost via area Marketing -> 5)
--   assistente-marketing          · 3 base + escopo_proprio (boost -> 5)
--   diretor-criativo (Pedro Menezes) · 1 base (boost via area Criativo nao se aplica
--                                       porque area do modulo eh "marketing", nao "criativo";
--                                       Pedro Menezes precisa override OU ser direto admin)
--   diretor-ministerial (Arthur)  · 1 (read · acompanha analytics)
--   diretor-administrativo (Eduardo) · 1 (read · acompanha)
--   Outros cargos                 · 0 (nao aparece no menu)

DO $$
DECLARE
  v_modulo_id integer;
BEGIN
  SELECT id INTO v_modulo_id FROM public.modulos WHERE slug = 'marketing';
  IF v_modulo_id IS NULL THEN
    RAISE EXCEPTION 'Modulo marketing nao encontrado · seed acima falhou';
  END IF;

  -- Insere/atualiza 1 linha por cargo
  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT c.id, v_modulo_id, lvl.nivel, lvl.pode_exportar, lvl.pode_aprovar, lvl.escopo_proprio
    FROM public.cargos c
    JOIN (VALUES
      ('dev',                     5, true,  true,  false),
      ('coordenador-marketing',   3, true,  true,  false),
      ('assistente-marketing',    3, false, false, true),
      ('diretor-criativo',        1, false, false, false),
      ('diretor-ministerial',     1, false, false, false),
      ('diretor-administrativo',  1, false, false, false),
      ('coordenador-estrategia',  1, false, false, false),
      ('pastor-senior',           1, false, false, false),
      ('pastor-presidente',       1, false, false, false)
    ) AS lvl(slug, nivel, pode_exportar, pode_aprovar, escopo_proprio)
      ON c.slug = lvl.slug
    WHERE c.ativo = true
  ON CONFLICT (cargo_id, modulo_id) DO UPDATE
    SET nivel          = EXCLUDED.nivel,
        pode_exportar  = EXCLUDED.pode_exportar,
        pode_aprovar   = EXCLUDED.pode_aprovar,
        escopo_proprio = EXCLUDED.escopo_proprio;

  -- Demais cargos ativos · nivel 0 (default · seguindo padrao "menu nao aparece")
  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT c.id, v_modulo_id, 0, false, false, false
    FROM public.cargos c
    WHERE c.ativo = true
      AND c.slug NOT IN (
        'dev','coordenador-marketing','assistente-marketing','diretor-criativo',
        'diretor-ministerial','diretor-administrativo','coordenador-estrategia',
        'pastor-senior','pastor-presidente'
      )
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Estende current_user_module_level · adiciona 'marketing' no boost por area
-- ----------------------------------------------------------------------------
-- Mantem assinatura/comportamento original · so adiciona 'marketing' na lista de
-- modulos que recebem boost (mesmo padrao de kids/ami/bridge/online/cuidados/...).
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

  SELECT GREATEST(COALESCE(pm.nivel_leitura, 0), COALESCE(pm.nivel_escrita, 0))
    INTO v_override
  FROM public.permissoes_modulo pm
  WHERE pm.usuario_id = v_user_id AND pm.modulo_id = v_modulo_id
    AND (pm.expira_em IS NULL OR pm.expira_em > now())
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    v_nivel := v_override;
  ELSE
    SELECT cmp.nivel INTO v_default
    FROM public.usuarios u
    JOIN public.cargo_modulo_permissao cmp ON cmp.cargo_id = u.cargo_id
    WHERE u.id = v_user_id AND cmp.modulo_id = v_modulo_id LIMIT 1;
    v_nivel := COALESCE(v_default, 0);
  END IF;

  -- BOOST por area · lista atualizada com 'marketing' (Spec 003 · 2026-05-28)
  IF p_module_slug IN ('kids','ami','bridge','online','cuidados',
                        'grupos','integracao','voluntariado','next',
                        'marketing') THEN
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

-- ----------------------------------------------------------------------------
-- 4. Seed marketing_membros · 4 dos 5 (Aline pendente)
-- ----------------------------------------------------------------------------
-- Pre-flight 2026-05-28: Allan/Caua/Leticia/Lorena Pariz tem profile + rh_funcionarios.
-- Aline NAO tem · cadastrada via UI admin (Spec 009) quando Marcos/Pedro souberem email.

INSERT INTO public.marketing_membros (profile_id, habilidade, horas_semanais, ativo, observacao)
SELECT p.id, h.habilidade, h.horas_semanais, true, h.observacao
  FROM public.profiles p
  JOIN (VALUES
    ('allan.santana@cbrio.org',   'videomaker',              40, 'Cobertura videos da igreja'),
    ('caua.pedreti@cbrio.org',    'designer',                40, 'Designer principal · sem recorrente fixo'),
    ('leticia.baldner@cbrio.org', 'social_media_assistente', 30, 'Auxiliar de social media · sem recorrente fixo'),
    ('lorena.pariz@cbrio.org',    'social_media',            40, 'Social media titular · atendimento RS diario seg-sab')
  ) AS h(email, habilidade, horas_semanais, observacao)
    ON LOWER(p.email) = LOWER(h.email)
ON CONFLICT (profile_id, habilidade) DO UPDATE
  SET horas_semanais = EXCLUDED.horas_semanais,
      observacao     = COALESCE(public.marketing_membros.observacao, EXCLUDED.observacao),
      ativo          = true,
      deleted_at     = NULL,
      updated_at     = now();

-- ----------------------------------------------------------------------------
-- 5. Seed marketing_compromissos_recorrentes (preliminar · Marcos 2026-05-28)
-- ----------------------------------------------------------------------------
-- Aline (fotografa) · domingo 08:30 ~6h · pendente cadastrar Aline antes
-- Allan · quarta · ~4h · hora_inicio a refinar com ele · seed em 14:00
-- Lorena Pariz · diario seg-sab · ~3h/dia · seed em 09:00
-- Caua e Leticia · sem recorrente (livres pra demanda)
--
-- Editavel via UI admin (Spec 009). Marcos e Pedro refinam horarios depois.

DO $$
DECLARE
  v_allan_id  uuid;
  v_lorena_id uuid;
BEGIN
  SELECT mm.id INTO v_allan_id
    FROM public.marketing_membros mm
    JOIN public.profiles p ON p.id = mm.profile_id
    WHERE LOWER(p.email) = 'allan.santana@cbrio.org' AND mm.habilidade = 'videomaker'
    LIMIT 1;

  SELECT mm.id INTO v_lorena_id
    FROM public.marketing_membros mm
    JOIN public.profiles p ON p.id = mm.profile_id
    WHERE LOWER(p.email) = 'lorena.pariz@cbrio.org' AND mm.habilidade = 'social_media'
    LIMIT 1;

  IF v_allan_id IS NOT NULL THEN
    INSERT INTO public.marketing_compromissos_recorrentes (membro_id, dia_semana, hora_inicio, duracao_h, descricao)
    SELECT v_allan_id, 3, TIME '14:00', 4.0, 'Gravacao de videos quarta (preliminar · refinar com Allan)'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.marketing_compromissos_recorrentes
       WHERE membro_id = v_allan_id AND dia_semana = 3 AND deleted_at IS NULL
    );
  END IF;

  IF v_lorena_id IS NOT NULL THEN
    INSERT INTO public.marketing_compromissos_recorrentes (membro_id, dia_semana, hora_inicio, duracao_h, descricao)
    SELECT v_lorena_id, d, TIME '09:00', 3.0,
           'Atendimento redes sociais + postagens (preliminar · seg-sab)'
      FROM generate_series(1, 6) AS d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.marketing_compromissos_recorrentes
        WHERE membro_id = v_lorena_id AND dia_semana = d AND deleted_at IS NULL
     );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. area_responsaveis · marketing ja tem entry (pre-flight confirmou Pedro Paiva)
-- ----------------------------------------------------------------------------
-- Sem ALTER · area_responsaveis.marketing -> Pedro Paiva ja existe com responsavel_id correto.

-- ----------------------------------------------------------------------------
-- 7. Comentarios
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.marketing_membros.habilidade IS
  'Habilidade unica do membro · alguns membros podem ter 2 linhas no futuro (ex: videomaker + designer).';
