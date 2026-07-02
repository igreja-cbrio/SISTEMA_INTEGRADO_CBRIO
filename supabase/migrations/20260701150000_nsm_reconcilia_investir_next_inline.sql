-- ============================================================================
-- RECONCILIAÇÃO da colisão em fn_nsm_sinais_engajados (2026-07-01).
--
-- Duas migrations reescreveram a MESMA função com timestamps próximos:
--   · 20260630140000_nsm_investir_so_devocional  (investir = SÓ devocional · next INLINE next_matriculas)
--   · 20260630170000_nsm_next_via_view           (next via vw_next_formado_pessoa · investir NÃO estreitado)
-- Como a 170000 tem timestamp maior, num rebuild pelas migrations ELA venceria →
-- perderia o "investir = só devocional" (decisão do Marcos) e traria o view-next.
-- Em produção está o INLINE + investir-devocional (aplicado por último), que é o
-- estado que destravou o bug do Cuidados > Próximos passos.
--
-- Esta migration fixa o estado FINAL = exatamente o que está VIVO e funcionando:
--   · investir = SÓ devocional  (preserva a decisão do Marcos · sobrevive a fresh runs)
--   · next     = INLINE next_matriculas + next_inscricoes  (NÃO re-introduz o
--                view-next que foi revertido pra destravar o Próximos passos)
-- É byte-idêntica à função viva → NO-OP em prod, só sincroniza git↔prod.
--
-- ⚠️ Resíduo conhecido (fora do escopo · dono = sessão do Próximos passos): o
-- coletor de KPI (kpiAutoCollector.cohortNoPrazoPct) e a intenção do #1445 usam
-- vw_next_formado_pessoa (formado POR PESSOA · cross-turma). Migrar o next desta
-- função pra essa view fica pra quando a sessão do Próximos passos confirmar que
-- não re-quebra a aba. Hoje o flip é neutro na coorte (#1445 validou 1->1).
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
     WHERE b.status = 'realizado' AND b.data_batismo BETWEEN v_ini AND v_fim
       AND ( b.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(b.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(b.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'batismo'); END IF;

  -- SEGUIR · NEXT · INLINE (matrícula formada id/cpf/nome OU check-in legado id/nome)
  IF EXISTS (
    SELECT 1 FROM public.next_matriculas n
     WHERE n.deleted_at IS NULL AND n.status = 'formado'
       AND n.created_at::date BETWEEN v_ini AND v_fim
       AND ( n.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(n.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(n.nome, ''))) = v_nome) )
  ) OR EXISTS (
    SELECT 1 FROM public.next_inscricoes ni
     WHERE ni.check_in_at IS NOT NULL AND ni.check_in_at::date BETWEEN v_ini AND v_fim
       AND ( ni.membro_id = p_membro_id
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(ni.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'next'); END IF;

  -- CONECTAR · GRUPO (membro_id · sem gate de data)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_grupo_membros g
     WHERE g.deleted_at IS NULL AND g.saiu_em IS NULL AND g.membro_id = p_membro_id
  ) THEN v_sig := array_append(v_sig, 'grupo'); END IF;

  -- INVESTIR · SÓ devocional (Marcos 2026-06-30 · "pra cuidados deve ser devocionais")
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
       AND c.tipo IN ('dizimo', 'oferta') AND c.data BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'generosidade'); END IF;

  RETURN v_sig;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_nsm_sinais_engajados(uuid, text, text, date, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_nsm_sinais_engajados(uuid, text, text, date, int) IS
  'Sinais de engajamento (±janela): batismo, next (INLINE next_matriculas+next_inscricoes · 2026-07-01), grupo, investir (SÓ devocional), servir, generosidade. Régua única com a Jornada (services/jornadaEngajamento).';

-- Recalcula o NSM já com o estado final reconciliado (no-op se já estava assim).
SELECT public.recalcular_nsm();
