-- Fix · merge_membros estourava unique_violation (mem_membros_cpf_key) quando o
-- registro MANTIDO não tinha CPF mas o descartado tinha: o enriquecimento setava
-- keep.cpf = merged.cpf ANTES do DELETE dos merged → dois registros vivos com o
-- mesmo CPF no instante do UPDATE. Sintoma: merge na aba Duplicados falhava pra
-- esses pares (e na consolidação em massa 2026-06-19).
--
-- Correção: capturar os valores de enriquecimento numa variável, DELETAR os
-- merged, e SÓ ENTÃO enriquecer o keep (vale pra qualquer coluna única — cpf,
-- email). Comportamento idêntico no resto (repoint de FKs, snapshot, log).

CREATE OR REPLACE FUNCTION public.merge_membros(p_keep_id uuid, p_merge_ids uuid[], p_feito_por uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  r record;
  v_cpf text;
  v_telefone text;
  v_email text;
  v_nascimento date;
  v_foto text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mem_membros WHERE id = p_keep_id) THEN
    RAISE EXCEPTION 'keep_id % não existe em mem_membros', p_keep_id;
  END IF;

  p_merge_ids := ARRAY(
    SELECT DISTINCT m_id
    FROM unnest(p_merge_ids) AS m_id
    WHERE m_id <> p_keep_id
      AND EXISTS (SELECT 1 FROM public.mem_membros WHERE id = m_id)
  );

  IF array_length(p_merge_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'merged', 0, 'observacao', 'nenhum merge_id válido');
  END IF;

  SELECT jsonb_agg(to_jsonb(m.*)) INTO v_snapshot
  FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids);

  -- Captura os valores de enriquecimento ANTES de deletar (1 valor não-nulo
  -- de cada coluna entre os merged). Aplicados no keep só depois do DELETE.
  SELECT
    (SELECT cpf             FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.cpf             IS NOT NULL LIMIT 1),
    (SELECT telefone        FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.telefone        IS NOT NULL LIMIT 1),
    (SELECT email           FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.email           IS NOT NULL LIMIT 1),
    (SELECT data_nascimento FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.data_nascimento IS NOT NULL LIMIT 1),
    (SELECT foto_url        FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.foto_url        IS NOT NULL LIMIT 1)
  INTO v_cpf, v_telefone, v_email, v_nascimento, v_foto;

  -- Pares ignorados envolvendo os merged perdem o sentido (e o CHECK a<b
  -- quebraria num self-pair) — remove.
  DELETE FROM public.mem_duplicados_ignorados
  WHERE membro_a_id = ANY(p_merge_ids) OR membro_b_id = ANY(p_merge_ids);

  -- Repoint dinâmico de todas as FKs -> mem_membros (pg_constraint: o
  -- information_schema é lento demais pra merges em lote)
  FOR r IN
    SELECT c.conrelid::regclass AS tab, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.mem_membros'::regclass
      AND c.conrelid <> 'public.mem_duplicados_ignorados'::regclass
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE %s SET %I = $1 WHERE %I = ANY($2)',
        r.tab, r.col, r.col
      ) USING p_keep_id, p_merge_ids;
    EXCEPTION WHEN unique_violation THEN
      -- keep já tem o equivalente: as linhas dos merged são redundantes
      EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', r.tab, r.col)
        USING p_merge_ids;
    END;
  END LOOP;

  -- Deleta os merged ANTES do enriquecimento (libera colunas únicas como cpf/email)
  DELETE FROM public.mem_membros WHERE id = ANY(p_merge_ids);

  -- Enriquecimento do keep com o que os merged tinham e ele não (já sem colisão)
  UPDATE public.mem_membros keep
  SET
    cpf             = COALESCE(keep.cpf,             v_cpf),
    telefone        = COALESCE(keep.telefone,        v_telefone),
    email           = COALESCE(keep.email,           v_email),
    data_nascimento = COALESCE(keep.data_nascimento, v_nascimento),
    foto_url        = COALESCE(keep.foto_url,        v_foto)
  WHERE keep.id = p_keep_id;

  INSERT INTO public.mem_merge_log (keep_id, merged_ids, snapshot, feito_por, observacao)
  VALUES (p_keep_id, p_merge_ids, COALESCE(v_snapshot, '[]'::jsonb), p_feito_por, p_observacao);

  RETURN jsonb_build_object('ok', true, 'keep_id', p_keep_id, 'merged', array_length(p_merge_ids, 1));
END $function$;
