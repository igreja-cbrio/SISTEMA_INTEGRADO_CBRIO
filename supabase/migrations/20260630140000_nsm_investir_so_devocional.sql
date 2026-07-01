-- ============================================================================
-- NSM · "investir" passa a ser SÓ devocional (não mais devocional OR
-- jornada180 OR aconselhamento). Decisão do Marcos 2026-06-30:
-- "pra cuidados deve ser devocionais" · unifica com o motor da Jornada
-- (services/jornadaEngajamento.js), que mede investir = devocional.
-- Assim NSM e Jornada medem a MESMA régua. CREATE OR REPLACE só do sinal +
-- re-run do recalcular_nsm (que chama esta função). Idempotente.
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

  -- SEGUIR · BATISMO (id OR cpf OR nome · data ±janela)
  IF EXISTS (
    SELECT 1 FROM public.batismo_inscricoes b
     WHERE b.status = 'realizado'
       AND b.data_batismo BETWEEN v_ini AND v_fim
       AND ( b.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(b.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(b.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'batismo'); END IF;

  -- SEGUIR · NEXT (formado nas turmas id/cpf/nome OU check-in legado id/nome)
  IF EXISTS (
    SELECT 1 FROM public.next_matriculas n
     WHERE n.deleted_at IS NULL AND n.status = 'formado'
       AND n.created_at::date BETWEEN v_ini AND v_fim
       AND ( n.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(n.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(n.nome, ''))) = v_nome) )
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

  -- INVESTIR · SÓ devocional (Marcos 2026-06-30 · "pra cuidados deve ser
  -- devocionais"). Antes: devocional OR cui_jornada180 OR cui_acompanhamentos.
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_devocionais d
     WHERE d.membro_id = p_membro_id AND d.concluida = true
       AND d.data_devocional BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'investir'); END IF;

  -- SERVIR · voluntário ativo (membro_id · ±janela)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_voluntarios v
     WHERE v.membro_id = p_membro_id AND v.deleted_at IS NULL AND v.ate IS NULL
       AND v.desde BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'servir'); END IF;

  -- GENEROSIDADE · dízimo/oferta (membro_id · ±janela)
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

COMMENT ON FUNCTION public.fn_nsm_sinais_engajados(uuid, text, text, date, int) IS
  'Sinais de engajamento (±janela): batismo, next, grupo, investir (SÓ devocional · 2026-06-30), servir, generosidade. Régua única compartilhada com a Jornada da Igreja (services/jornadaEngajamento).';

-- Recalcula o NSM já com a régua nova (investir = só devocional).
DO $$
BEGIN
  PERFORM public.recalcular_nsm();
  RAISE NOTICE 'NSM recalculado · investir = só devocional.';
END $$;
