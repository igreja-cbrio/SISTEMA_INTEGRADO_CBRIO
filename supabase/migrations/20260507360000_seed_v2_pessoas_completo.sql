-- ============================================================================
-- SEED V2 · Cadastro completo das liderancas + atribuicao de papeis
--
-- Substitui a versao anterior (20260507340000) com:
--   - Keila Leal como lider de Generosidade (Eduardo sai do ministerio,
--     mantem so como diretoria geral)
--   - Keila + Lillian sao FUNCIONARIAS (rh_funcionarios), nao membros —
--     Marcos quer separacao explicita entre quem acessa o sistema (func)
--     e quem e so membro
--   - Helper para listar matches no fim, pra Marcos validar e ajustar
--
-- Idempotente. Pode rodar varias vezes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER: cadastrar funcionario em rh_funcionarios (se nao existir)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_funcionario(
  p_nome text,
  p_cargo text,
  p_area text DEFAULT NULL,
  p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.rh_funcionarios
   WHERE status = 'ativo'
     AND lower(nome) = lower(p_nome);

  IF v_id IS NOT NULL THEN
    UPDATE public.rh_funcionarios
       SET cargo = COALESCE(NULLIF(cargo, ''), p_cargo),
           area  = COALESCE(NULLIF(area, ''),  p_area)
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.rh_funcionarios (nome, cargo, area, email, status)
  VALUES (p_nome, p_cargo, p_area, p_email, 'ativo')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. HELPER: listar matches em profiles e mem_membros (pra debug/validacao)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_matches_seed(p_termo text)
RETURNS TABLE (
  origem text,
  id uuid,
  nome text,
  email text
)
LANGUAGE sql
AS $$
  SELECT 'profile'::text AS origem, id, name AS nome, email
    FROM public.profiles
   WHERE active = true
     AND lower(name) LIKE '%' || lower(p_termo) || '%'
  UNION ALL
  SELECT 'membro'::text AS origem, id, nome, email
    FROM public.mem_membros
   WHERE active = true
     AND lower(nome) LIKE '%' || lower(p_termo) || '%'
  UNION ALL
  SELECT 'funcionario'::text AS origem, id, nome, email
    FROM public.rh_funcionarios
   WHERE status = 'ativo'
     AND lower(nome) LIKE '%' || lower(p_termo) || '%';
$$;

GRANT EXECUTE ON FUNCTION public.listar_matches_seed(text) TO authenticated, service_role;

-- ============================================================================
-- 3. CADASTRAR KEILA E LILLIAN COMO FUNCIONARIAS (nao membros)
-- ============================================================================
SELECT public.seed_funcionario('Keila Leal',      'Lider Ministerio Generosidade',  'Adm/Financeiro');
SELECT public.seed_funcionario('Lillian Oliveira','Lider Area Bridge',              'Bridge');

-- ============================================================================
-- 4. CADASTRAR DEMAIS LIDERANCAS EM mem_membros
--    (a maioria provavelmente ja existe no sistema · seed_membro pula se sim)
-- ============================================================================
SELECT public.seed_membro('Alda Lorena',     'Lider Ministerio Integracao');
SELECT public.seed_membro('Ariel',           'Assistente Ministerios Integracao + Voluntariado');
SELECT public.seed_membro('Pr. Nelio',       'Lider Ministerio Grupos · Lider Area CBA');
SELECT public.seed_membro('Natasha',         'Assistente Ministerio Grupos');
SELECT public.seed_membro('Pr. Wesley',      'Lider Ministerio Cuidados');
SELECT public.seed_membro('Marcelo Soares',  'Assistente Ministerio Cuidados');
SELECT public.seed_membro('Jessica',         'Lider Ministerio Voluntariado');
SELECT public.seed_membro('Eduardo Gnisci',  'Lider Gestao · Diretoria Geral');
SELECT public.seed_membro('Yago Torres',     'Assistente Ministerio Generosidade · Financeiro');
SELECT public.seed_membro('Arthur Cecconi',  'Lider Area AMI');
SELECT public.seed_membro('Mariane Gaia',    'Lider Area Kids');
SELECT public.seed_membro('Pr. Juninho',     'Pastor Presidente · Diretoria Geral · Lider Area Sede');
SELECT public.seed_membro('Renata',          'Lider Area Online');
SELECT public.seed_membro('Pr. Pedrao',      'Pastor Senior · Diretoria Geral');
SELECT public.seed_membro('Arthur Serpa',    'Lider Ministerial · Diretoria Geral');
SELECT public.seed_membro('Pedro Menezes',   'Lider Criativo · Diretoria Geral');

-- ============================================================================
-- 5. LIMPAR ATRIBUICOES ANTIGAS (pra reaplicar limpas)
--    Tira o ministerio do Eduardo (ele sai de generosidade · vira so diretoria)
-- ============================================================================
UPDATE public.profiles
   SET ministerio_id = NULL,
       ministerio_papel = NULL
 WHERE active = true
   AND lower(name) LIKE '%gnisci%';

-- ============================================================================
-- 6. ATRIBUIR MINISTERIOS · busca por sobrenome quando houver
-- ============================================================================
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Lorena',         'integracao',     'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Ariel',          'integracao',     'assistente');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Nelio',          'grupos',         'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Natasha',        'grupos',         'assistente');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Wesley',         'cuidados',       'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Marcelo Soares', 'cuidados',       'assistente');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Jessica',        'voluntariado',   'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Ariel',          'voluntariado',   'assistente');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Keila',          'adm_financeiro', 'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Yago',           'adm_financeiro', 'assistente');

-- ============================================================================
-- 7. ATRIBUIR KPI_AREAS (lider de area)
-- ============================================================================
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Cecconi',  ARRAY['ami']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Gaia',     ARRAY['kids']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Lillian',  ARRAY['bridge']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Juninho',  ARRAY['sede']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Renata',   ARRAY['online']);
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Nelio',    ARRAY['cba']);

-- ============================================================================
-- 8. DIRETORIA GERAL · 5 nominais
-- ============================================================================
SELECT 'Dir: ' || (resultado) FROM public.marcar_diretoria_geral('Pedrao',        'Pastor Senior');
SELECT 'Dir: ' || (resultado) FROM public.marcar_diretoria_geral('Juninho',       'Pastor Presidente');
SELECT 'Dir: ' || (resultado) FROM public.marcar_diretoria_geral('Gnisci',        'Lider de Gestao');
SELECT 'Dir: ' || (resultado) FROM public.marcar_diretoria_geral('Arthur Serpa',  'Lider Ministerial');
SELECT 'Dir: ' || (resultado) FROM public.marcar_diretoria_geral('Pedro Menezes', 'Lider Criativo');

-- ============================================================================
-- 9. RELATORIO FINAL · roda essas queries pra ver o estado
-- ============================================================================

-- Quem esta atribuido em ministerios
-- SELECT p.name, p.email, m.nome AS ministerio, p.ministerio_papel
--   FROM profiles p JOIN ministerios m ON m.id = p.ministerio_id
--   WHERE p.active = true
--   ORDER BY m.ordem, p.ministerio_papel DESC;

-- Quem lidera area
-- SELECT name, email, kpi_areas FROM profiles
--  WHERE active = true AND array_length(kpi_areas, 1) > 0
--  ORDER BY name;

-- Diretoria geral
-- SELECT name, email, funcao_diretoria FROM profiles
--  WHERE is_diretoria_geral = true ORDER BY funcao_diretoria;

-- ============================================================================
-- VALIDACAO PRA CADA NOME · busca em profile/membro/funcionario
-- Caso de "AMBIGUO" no log acima, rodar listar_matches_seed pra escolher
-- ============================================================================
-- SELECT * FROM listar_matches_seed('Lorena');
-- SELECT * FROM listar_matches_seed('Ariel');
-- SELECT * FROM listar_matches_seed('Nelio');
-- SELECT * FROM listar_matches_seed('Natasha');
-- SELECT * FROM listar_matches_seed('Wesley');
-- SELECT * FROM listar_matches_seed('Soares');
-- SELECT * FROM listar_matches_seed('Jessica');
-- SELECT * FROM listar_matches_seed('Keila');
-- SELECT * FROM listar_matches_seed('Yago');
-- SELECT * FROM listar_matches_seed('Cecconi');
-- SELECT * FROM listar_matches_seed('Gaia');
-- SELECT * FROM listar_matches_seed('Lillian');
-- SELECT * FROM listar_matches_seed('Juninho');
-- SELECT * FROM listar_matches_seed('Renata');
-- SELECT * FROM listar_matches_seed('Pedrao');
-- SELECT * FROM listar_matches_seed('Serpa');
-- SELECT * FROM listar_matches_seed('Menezes');
-- SELECT * FROM listar_matches_seed('Gnisci');
