-- =====================================================================
-- Marcelo Soares · adicionar em rh_funcionarios + fix seed_funcionario
-- =====================================================================
-- Marcelo e funcionario da CBRio (Supervisor de Jornada). Estava apenas
-- em mem_membros (via seed_membro), faltava registro em rh_funcionarios.
-- Sem isso ele nao aparece na lista de colaboradores do /admin/permissoes.
--
-- 1. Conserta seed_funcionario · INSERT sem tipo_contrato caia no default
--    'clt' lowercase do banco, que viola o check constraint
--    rh_funcionarios_tipo_contrato_check (exige 'CLT','PJ','PJ+','PREBENDA').
--    Pattern ja documentado em 20260521120000_cultos_hotfix_lideres.sql.
--
-- 2. Insere Marcelo via seed_funcionario corrigido (idempotente).
-- =====================================================================

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
           area  = COALESCE(NULLIF(area, ''),  p_area),
           email = COALESCE(NULLIF(email, ''), p_email)
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- tipo_contrato='CLT' explicito · default do banco eh 'clt' lowercase
  -- e check constraint exige uppercase ('CLT','PJ','PJ+','PREBENDA')
  INSERT INTO public.rh_funcionarios
    (nome, cargo, area, email, status, tipo_contrato, data_admissao)
  VALUES
    (p_nome, p_cargo, p_area, p_email, 'ativo', 'CLT', current_date)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Insere Marcelo
SELECT public.seed_funcionario(
  'Marcelo Soares',
  'Supervisor de Jornada',
  'Ministerial',
  'marcelo.soares@cbrio.org'
);

-- Conferencia
-- SELECT id, nome, cargo, area, email, tipo_contrato, status FROM public.rh_funcionarios
--  WHERE LOWER(nome) LIKE '%marcelo%soares%';
