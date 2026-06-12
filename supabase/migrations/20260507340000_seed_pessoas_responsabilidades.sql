-- ============================================================================
-- SEED · Cadastra liderancas + atribui responsabilidades
--
-- Marcos passou os nomes em 2026-05-07. Esta migration:
--   1. Cadastra cada pessoa em mem_membros (se nao existir) com cargo
--   2. Atribui ministerios (lider/assistente) a quem tem profile
--   3. Atribui kpi_areas (lider de area) a quem tem profile
--   4. Marca diretoria geral
--   5. Retorna log do que foi feito + quem nao tem profile (Marcos cria depois)
--
-- Idempotente — pode rodar varias vezes sem efeito colateral.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER: cadastrar pessoa em mem_membros
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_membro(
  p_nome text,
  p_cargo text,
  p_status text DEFAULT 'membro_ativo'
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Busca por nome (case insensitive) — se ja existe, retorna o id
  SELECT id INTO v_id
    FROM public.mem_membros
   WHERE active = true
     AND lower(nome) = lower(p_nome);

  IF v_id IS NOT NULL THEN
    -- Atualiza cargo (campo "ministerio" da mem_membros e usado pra cargo/funcao)
    UPDATE public.mem_membros
       SET ministerio = p_cargo
     WHERE id = v_id
       AND (ministerio IS NULL OR ministerio = '');
    RETURN v_id;
  END IF;

  -- Insere novo
  INSERT INTO public.mem_membros (nome, ministerio, status, active)
  VALUES (p_nome, p_cargo, p_status, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. HELPER: atribuir kpi_areas a profile (busca por nome)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuir_kpi_area(
  p_busca_nome text,
  p_areas text[]
) RETURNS TABLE (
  profile_id uuid,
  nome_encontrado text,
  resultado text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_profile RECORD;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.profiles
   WHERE active = true
     AND lower(name) LIKE '%' || lower(p_busca_nome) || '%';

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text,
      ('FALTA: nenhum profile encontrado com "' || p_busca_nome || '" — Marcos cadastra depois')::text;
    RETURN;
  END IF;

  IF v_count > 1 THEN
    FOR v_profile IN
      SELECT id, name FROM public.profiles
       WHERE active = true AND lower(name) LIKE '%' || lower(p_busca_nome) || '%'
       ORDER BY name
    LOOP
      RETURN QUERY SELECT v_profile.id, v_profile.name,
        ('AMBIGUO: refine a busca')::text;
    END LOOP;
    RETURN;
  END IF;

  SELECT id, name INTO v_profile
    FROM public.profiles
   WHERE active = true AND lower(name) LIKE '%' || lower(p_busca_nome) || '%';

  -- Append areas (sem duplicar)
  UPDATE public.profiles
     SET kpi_areas = (SELECT array_agg(DISTINCT a) FROM unnest(coalesce(kpi_areas, '{}'::text[]) || p_areas) AS a)
   WHERE id = v_profile.id;

  RETURN QUERY SELECT v_profile.id, v_profile.name,
    ('OK · kpi_areas adicionadas: ' || array_to_string(p_areas, ', '))::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_kpi_area(text, text[]) TO authenticated, service_role;

-- ============================================================================
-- 3. CADASTRO EM mem_membros
-- ============================================================================
SELECT public.seed_membro('Alda Lorena',     'Lider Ministerio Integracao');
SELECT public.seed_membro('Ariel',           'Assistente Ministerios Integracao + Voluntariado');
SELECT public.seed_membro('Pr. Nelio',       'Lider Ministerio Grupos · Lider Area CBA');
SELECT public.seed_membro('Natasha',         'Assistente Ministerio Grupos');
SELECT public.seed_membro('Pr. Wesley',      'Lider Ministerio Cuidados');
SELECT public.seed_membro('Marcelo Soares',  'Assistente Ministerio Cuidados');
SELECT public.seed_membro('Jessica',         'Lider Ministerio Voluntariado');
SELECT public.seed_membro('Eduardo Gnisci',  'Lider Gestao · Diretoria Geral · Lider Ministerio Generosidade');
SELECT public.seed_membro('Yago Torres',     'Assistente Ministerio Generosidade · Financeiro');
SELECT public.seed_membro('Arthur Cecconi',  'Lider Area AMI');
SELECT public.seed_membro('Mariane Gaia',    'Lider Area Kids');
SELECT public.seed_membro('Lillian Oliveira','Lider Area Bridge');
SELECT public.seed_membro('Pr. Juninho',     'Pastor Presidente · Diretoria Geral · Lider Area Sede');
SELECT public.seed_membro('Renata',          'Lider Area Online');
SELECT public.seed_membro('Pr. Pedrao',      'Pastor Senior · Diretoria Geral');
SELECT public.seed_membro('Arthur Serpa',    'Lider Ministerial · Diretoria Geral');
SELECT public.seed_membro('Pedro Menezes',   'Lider Criativo · Diretoria Geral');

-- ============================================================================
-- 4. ATRIBUICOES nos PROFILES (so funciona pra quem ja tem profile)
--    A funcao retorna OK ou "FALTA: ..." pra Marcos saber quem cadastrar
-- ============================================================================

-- ===== MINISTERIOS =====
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Lorena',         'integracao',     'lider');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Ariel',          'integracao',     'assistente');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Nelio',          'grupos',         'lider');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Natasha',        'grupos',         'assistente');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Wesley',         'cuidados',       'lider');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Marcelo Soares', 'cuidados',       'assistente');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Jessica',        'voluntariado',   'lider');
-- Ariel tambem na voluntariado: a coluna ministerio_id e unica por profile, entao
-- Ariel acaba assumindo o ULTIMO ministerio atribuido (voluntariado) — Marcos avisou
-- que Ariel cobre os 2. Quando achar substituto pra integracao, atualizar.
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Ariel',          'voluntariado',   'assistente');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Eduardo',        'adm_financeiro', 'lider');
SELECT 'Ministerio: ' || (resultado) FROM public.atribuir_ministerio('Yago',           'adm_financeiro', 'assistente');

-- ===== KPI_AREAS (lider de area) =====
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Cecconi',         ARRAY['ami']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Mariane',         ARRAY['kids']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Lillian',         ARRAY['bridge']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Juninho',         ARRAY['sede']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Renata',          ARRAY['online']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Nelio',           ARRAY['cba']);

-- ===== DIRETORIA GERAL =====
SELECT 'Diretoria: ' || (resultado) FROM public.marcar_diretoria_geral('Pedrao',        'Pastor Senior');
SELECT 'Diretoria: ' || (resultado) FROM public.marcar_diretoria_geral('Juninho',       'Pastor Presidente');
SELECT 'Diretoria: ' || (resultado) FROM public.marcar_diretoria_geral('Eduardo Gnisci','Lider de Gestao');
SELECT 'Diretoria: ' || (resultado) FROM public.marcar_diretoria_geral('Arthur Serpa',  'Lider Ministerial');
SELECT 'Diretoria: ' || (resultado) FROM public.marcar_diretoria_geral('Pedro Menezes', 'Lider Criativo');

-- ============================================================================
-- 5. CONFERENCIA · resumo
-- ============================================================================
-- Membros cadastrados:
-- SELECT nome, ministerio FROM mem_membros
--  WHERE ministerio IS NOT NULL AND ministerio != ''
--    AND (ministerio LIKE '%Lider%' OR ministerio LIKE '%Pastor%' OR ministerio LIKE '%Diretoria%' OR ministerio LIKE '%Assistente%')
--  ORDER BY nome;

-- Profiles com ministerio atribuido:
-- SELECT p.name, m.nome AS ministerio, p.ministerio_papel
--   FROM profiles p JOIN ministerios m ON m.id = p.ministerio_id
--  ORDER BY m.ordem, p.ministerio_papel;

-- Profiles com kpi_areas:
-- SELECT name, kpi_areas FROM profiles
--  WHERE active = true AND kpi_areas IS NOT NULL AND array_length(kpi_areas, 1) > 0
--  ORDER BY name;

-- Diretoria geral:
-- SELECT name, funcao_diretoria FROM profiles WHERE is_diretoria_geral = true ORDER BY name;
