-- merge_membros v2 — repoint dinâmico de TODAS as FKs que referenciam
-- mem_membros (information_schema), em vez da lista fixa da v1 que não
-- cobria tabelas novas (profiles, mem_escalas, batismo_inscricoes,
-- kids_*, vol_profiles.membresia_id, ...) e fazia o DELETE final falhar.
--
-- Mantém: assinatura, enriquecimento do keep com dados dos merged,
-- snapshot + mem_merge_log. Novidades:
--  · unique_violation ao repointar -> linha do merged é redundante, deleta
--  · mem_duplicados_ignorados: linhas dos merged são apagadas (CHECK a<b
--    quebraria ao virar self-pair)
--
-- APLICADA EM PRODUÇÃO em 2026-06-12 (via Management API).

CREATE OR REPLACE FUNCTION public.merge_membros(
  p_keep_id uuid,
  p_merge_ids uuid[],
  p_feito_por uuid DEFAULT NULL::uuid,
  p_observacao text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  r record;
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

  -- Enriquecimento do keep com o que os merged tinham e ele não
  UPDATE public.mem_membros keep
  SET
    cpf             = COALESCE(keep.cpf,             (SELECT cpf             FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.cpf             IS NOT NULL LIMIT 1)),
    telefone        = COALESCE(keep.telefone,        (SELECT telefone        FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.telefone        IS NOT NULL LIMIT 1)),
    email           = COALESCE(keep.email,           (SELECT email           FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.email           IS NOT NULL LIMIT 1)),
    data_nascimento = COALESCE(keep.data_nascimento, (SELECT data_nascimento FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.data_nascimento IS NOT NULL LIMIT 1)),
    foto_url        = COALESCE(keep.foto_url,        (SELECT foto_url        FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.foto_url        IS NOT NULL LIMIT 1))
  WHERE keep.id = p_keep_id;

  DELETE FROM public.mem_membros WHERE id = ANY(p_merge_ids);

  INSERT INTO public.mem_merge_log (keep_id, merged_ids, snapshot, feito_por, observacao)
  VALUES (p_keep_id, p_merge_ids, COALESCE(v_snapshot, '[]'::jsonb), p_feito_por, p_observacao);

  RETURN jsonb_build_object('ok', true, 'keep_id', p_keep_id, 'merged', array_length(p_merge_ids, 1));
END $function$;
