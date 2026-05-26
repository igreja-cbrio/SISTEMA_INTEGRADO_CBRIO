-- Funcao pra buscar historico de classificacoes de um pagador (por CPF/CNPJ ou nome)
-- Cruza fin_transacoes com fin_pix_detalhe via pix_detalhe_id OU lancamento_bruto_id
-- Retorna agregacao por plano de contas pra ajudar o admin a decidir dizimo vs oferta

CREATE OR REPLACE FUNCTION public.fin_historico_pagador(
  p_documento text,
  p_nome text
)
RETURNS TABLE(codigo text, nome text, count bigint, total_valor numeric, ultimo_uso date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_doc text;
  v_nome_norm text;
BEGIN
  v_doc := NULLIF(regexp_replace(COALESCE(p_documento, ''), '[^0-9]', '', 'g'), '');
  v_nome_norm := NULLIF(lower(unaccent(trim(COALESCE(p_nome, '')))), '');

  IF v_doc IS NULL AND v_nome_norm IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH pix_match AS (
    SELECT id, lancamento_bruto_id
    FROM fin_pix_detalhe
    WHERE (v_doc IS NOT NULL AND regexp_replace(COALESCE(pagador_documento, ''), '[^0-9]', '', 'g') = v_doc)
       OR (v_nome_norm IS NOT NULL AND lower(unaccent(COALESCE(pagador_nome, ''))) = v_nome_norm)
  )
  SELECT
    pc.codigo,
    pc.nome,
    count(*)::bigint AS count,
    sum(t.valor)::numeric AS total_valor,
    max(t.data_pagamento)::date AS ultimo_uso
  FROM fin_transacoes t
  JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.tipo = 'receita'
    AND (
      t.pix_detalhe_id IN (SELECT id FROM pix_match)
      OR t.lancamento_bruto_id IN (SELECT lancamento_bruto_id FROM pix_match WHERE lancamento_bruto_id IS NOT NULL)
    )
  GROUP BY pc.codigo, pc.nome
  ORDER BY count(*) DESC, total_valor DESC
  LIMIT 8;
END;
$$;

COMMIT;
