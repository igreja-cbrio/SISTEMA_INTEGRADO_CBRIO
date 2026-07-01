-- ============================================================================
-- NSM - sinal "fez Next" passa a ler vw_next_formado_pessoa (formado POR PESSOA,
-- cross-turma) em vez de next_matriculas.status='formado' (per-turma).
--
-- Validado contra dados vivos: o sinal Next na coorte 90d fica 1->1 (flip neutro
-- na NSM · a view usa formado_em = min(created_at), igual ao que a NSM usava).
-- Mantem o EXISTS do check-in legado (next_inscricoes) como rede de seguranca
-- enquanto o totem ainda escreve no legado (sera removido quando o totem migrar
-- pra next_matriculas). So o bloco NEXT muda; o resto da funcao e identico.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_nsm_sinais_engajados(
  p_membro_id uuid,
  p_cpf       text,
  p_nome      text,
  p_data      date,
  p_janela    int DEFAULT 60
) RETURNS text[]
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_ini  date := p_data - p_janela;
  v_fim  date := p_data + p_janela;
  v_cpf  text := NULLIF(regexp_replace(coalesce(p_cpf, ''),  '[^0-9]', '', 'g'), '');
  v_nome text := NULLIF(lower(trim(coalesce(p_nome, ''))), '');
  v_sig  text[] := ARRAY[]::text[];
BEGIN
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN v_cpf := NULL; END IF;

  -- SEGUIR · BATISMO (id OR cpf OR nome · data +-janela)
  IF EXISTS (
    SELECT 1 FROM public.batismo_inscricoes b
     WHERE b.status = 'realizado'
       AND b.data_batismo BETWEEN v_ini AND v_fim
       AND ( b.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(b.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(b.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'batismo'); END IF;

  -- SEGUIR · NEXT (fez Next POR PESSOA · fonte unica vw_next_formado_pessoa ·
  -- + check-in legado id/nome enquanto o totem nao migra pra next_matriculas)
  IF EXISTS (
    SELECT 1 FROM public.vw_next_formado_pessoa v
     WHERE v.formado_em BETWEEN v_ini AND v_fim
       AND ( v.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(v.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(v.nome, ''))) = v_nome) )
  ) OR EXISTS (
    SELECT 1 FROM public.next_inscricoes ni
     WHERE ni.check_in_at IS NOT NULL
       AND ni.check_in_at::date BETWEEN v_ini AND v_fim
       AND ( ni.membro_id = p_membro_id
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(ni.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'next'); END IF;

  -- CONECTAR · GRUPO (membro_id · sem gate de data · entrou_em = data de import)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_grupo_membros g
     WHERE g.deleted_at IS NULL AND g.saiu_em IS NULL AND g.membro_id = p_membro_id
  ) THEN v_sig := array_append(v_sig, 'grupo'); END IF;

  -- INVESTIR · devocional / Jornada 180 / aconselhamento (membro_id · +-janela)
  IF p_membro_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.mem_devocionais d
                WHERE d.membro_id = p_membro_id AND d.concluida = true
                  AND d.data_devocional BETWEEN v_ini AND v_fim)
    OR EXISTS (SELECT 1 FROM public.cui_jornada180 j
                WHERE j.membro_id = p_membro_id AND j.deleted_at IS NULL
                  AND j.presente IS DISTINCT FROM false
                  AND j.data_encontro BETWEEN v_ini AND v_fim)
    OR EXISTS (SELECT 1 FROM public.cui_acompanhamentos a
                WHERE a.membro_id = p_membro_id
                  AND a.data_inicio BETWEEN v_ini AND v_fim)
  ) THEN v_sig := array_append(v_sig, 'investir'); END IF;

  -- SERVIR · voluntario ativo (membro_id · +-janela)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_voluntarios mv
     WHERE mv.membro_id = p_membro_id AND mv.deleted_at IS NULL AND mv.ate IS NULL
       AND mv.desde BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'servir'); END IF;

  -- GENEROSIDADE · dizimo/oferta (membro_id · +-janela)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_contribuicoes c
     WHERE c.membro_id = p_membro_id AND c.deleted_at IS NULL
       AND c.tipo IN ('dizimo', 'oferta')
       AND c.data BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'generosidade'); END IF;

  RETURN v_sig;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_nsm_sinais_engajados(uuid, text, text, date, int) TO authenticated, service_role;
