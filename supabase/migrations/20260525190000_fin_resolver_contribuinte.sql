-- Resolve membro por CPF/nome ou cria como contribuinte_avulso se nao existir
-- Usada ao aprovar lancamentos da fila com pagadores identificados
CREATE OR REPLACE FUNCTION public.fin_resolver_ou_criar_contribuinte(
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_doc_norm TEXT;
  v_nome_norm TEXT;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) < 3 THEN RETURN NULL; END IF;
  v_doc_norm := regexp_replace(COALESCE(p_documento, ''), '\D', '', 'g');
  IF length(v_doc_norm) = 0 THEN v_doc_norm := NULL; END IF;
  v_nome_norm := trim(p_nome);

  IF v_doc_norm IS NOT NULL THEN
    SELECT id INTO v_id FROM mem_membros
    WHERE cpf = v_doc_norm AND deleted_at IS NULL LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  SELECT id INTO v_id FROM mem_membros
  WHERE lower(unaccent(nome)) = lower(unaccent(v_nome_norm))
    AND deleted_at IS NULL
  ORDER BY (cpf IS NOT NULL) DESC, created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF v_doc_norm IS NOT NULL THEN
      UPDATE mem_membros SET cpf = COALESCE(cpf, v_doc_norm),
        telefone = COALESCE(telefone, p_telefone),
        email = COALESCE(email, p_email)
      WHERE id = v_id AND (cpf IS NULL OR telefone IS NULL OR email IS NULL);
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO mem_membros (nome, cpf, telefone, email, status)
  VALUES (v_nome_norm, v_doc_norm, p_telefone, p_email, 'contribuinte_avulso')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
