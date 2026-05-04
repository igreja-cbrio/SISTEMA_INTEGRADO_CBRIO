-- RPC atomico para editar encontro: ajusta tema/observacoes/data e
-- recalcula presencas pelo diff (insere novas, remove canceladas)
-- ajustando o contador legado mem_grupo_membros.presencas.

CREATE OR REPLACE FUNCTION public.atualizar_encontro_grupo(
  p_encontro_id uuid,
  p_data date,
  p_tema text,
  p_observacoes text,
  p_membros_presentes uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_grupo_id uuid;
  v_membro_id uuid;
  v_atuais uuid[];
  v_a_adicionar uuid[];
  v_a_remover uuid[];
BEGIN
  SELECT grupo_id INTO v_grupo_id
    FROM public.mem_grupo_encontros WHERE id = p_encontro_id;
  IF v_grupo_id IS NULL THEN
    RAISE EXCEPTION 'Encontro nao encontrado';
  END IF;

  -- Coleta presentes atuais
  SELECT COALESCE(array_agg(membro_id), ARRAY[]::uuid[]) INTO v_atuais
    FROM public.mem_grupo_encontro_presencas
    WHERE encontro_id = p_encontro_id AND presente = true;

  -- Calcula diff
  IF p_membros_presentes IS NULL THEN
    p_membros_presentes := ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(array_agg(m), ARRAY[]::uuid[]) INTO v_a_adicionar
    FROM unnest(p_membros_presentes) m
    WHERE m <> ALL(v_atuais);

  SELECT COALESCE(array_agg(m), ARRAY[]::uuid[]) INTO v_a_remover
    FROM unnest(v_atuais) m
    WHERE m <> ALL(p_membros_presentes);

  -- Remove canceladas + decrementa contador
  IF array_length(v_a_remover, 1) > 0 THEN
    DELETE FROM public.mem_grupo_encontro_presencas
      WHERE encontro_id = p_encontro_id AND membro_id = ANY(v_a_remover);

    FOREACH v_membro_id IN ARRAY v_a_remover LOOP
      UPDATE public.mem_grupo_membros
         SET presencas = GREATEST(COALESCE(presencas, 0) - 1, 0)
       WHERE grupo_id = v_grupo_id AND membro_id = v_membro_id AND saiu_em IS NULL;
    END LOOP;
  END IF;

  -- Insere novas + incrementa contador
  IF array_length(v_a_adicionar, 1) > 0 THEN
    FOREACH v_membro_id IN ARRAY v_a_adicionar LOOP
      INSERT INTO public.mem_grupo_encontro_presencas (encontro_id, membro_id, presente)
      VALUES (p_encontro_id, v_membro_id, true)
      ON CONFLICT (encontro_id, membro_id) DO UPDATE SET presente = true;

      UPDATE public.mem_grupo_membros
         SET presencas = COALESCE(presencas, 0) + 1
       WHERE grupo_id = v_grupo_id AND membro_id = v_membro_id AND saiu_em IS NULL;
    END LOOP;
  END IF;

  -- Atualiza metadados do encontro
  UPDATE public.mem_grupo_encontros
     SET data = COALESCE(p_data, data),
         tema = p_tema,
         observacoes = p_observacoes
   WHERE id = p_encontro_id;

  RETURN p_encontro_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_encontro_grupo(uuid, date, text, text, uuid[])
  TO authenticated, service_role;
