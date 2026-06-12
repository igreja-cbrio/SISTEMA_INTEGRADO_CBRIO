-- ============================================================================
-- FIX · seed_funcionario: incluir data_admissao (NOT NULL no schema atual)
--
-- Schema drift: rh_funcionarios.data_admissao virou NOT NULL em algum momento
-- depois da migration original. Corrigindo.
--
-- Tambem retentando a insercao da Keila + Lillian (caso o erro tenha feito
-- rollback parcial).
-- ============================================================================

-- Recria seed_funcionario com data_admissao = current_date como default
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

  INSERT INTO public.rh_funcionarios (nome, cargo, area, email, status, data_admissao)
  VALUES (p_nome, p_cargo, p_area, p_email, 'ativo', current_date)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Reaplicar Keila + Lillian (idempotente — pula se ja existir)
SELECT public.seed_funcionario('Keila Leal',       'Lider Ministerio Generosidade',  'Adm/Financeiro');
SELECT public.seed_funcionario('Lillian Oliveira', 'Lider Area Bridge',              'Bridge');

-- Reaplicar atribuicoes (idempotentes)
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Keila',          'adm_financeiro', 'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Yago',           'adm_financeiro', 'assistente');
SELECT 'Area: ' || (resultado) FROM public.atribuir_kpi_area('Lillian', ARRAY['bridge']);

-- Conferir
-- SELECT nome, cargo, area, data_admissao FROM rh_funcionarios
--  WHERE nome IN ('Keila Leal', 'Lillian Oliveira');
