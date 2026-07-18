-- ============================================================================
-- Grupos · revisão de fim de temporada: membros SEM presença (2026-07-18)
--
-- Marcos: no fechamento da temporada, listar quem nunca apareceu em nenhuma
-- chamada do líder — candidatos a sair do grupo. NÃO é automático (o gate é
-- humano · a Naná confirma); e SÓ vale para grupos que de fato registraram
-- encontros (ausência de chamada ≠ ausência da pessoa). Líder / co-líder /
-- em treinamento NUNCA entram na lista (não se remove liderança por presença).
--
-- Escopado pela janela de data da temporada. STABLE SECURITY DEFINER. Cap-safe
-- (agrega em SQL). Sem tabela nova. A remoção usa o PATCH /participacao/:id/sair.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_temporada_sem_presenca(p_temporada text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date;
  v_fim    date;
  v_out    jsonb;
BEGIN
  SELECT t.data_inicio, LEAST(COALESCE(t.data_fim, CURRENT_DATE), CURRENT_DATE)
    INTO v_inicio, v_fim
    FROM public.mem_temporadas t WHERE t.id = p_temporada;
  v_inicio := COALESCE(v_inicio, DATE '2000-01-01');
  v_fim    := COALESCE(v_fim, CURRENT_DATE);

  WITH ga AS (
    SELECT id, nome, codigo, lider_id
      FROM public.mem_grupos
     WHERE deleted_at IS NULL AND ativo = true AND temporada::text = p_temporada
  ),
  enc AS (
    SELECT e.id, e.grupo_id
      FROM public.mem_grupo_encontros e
      JOIN ga ON ga.id = e.grupo_id
     WHERE e.deleted_at IS NULL AND e.data >= v_inicio AND e.data <= v_fim
  ),
  grupos_com_enc AS (
    SELECT grupo_id, count(*)::int AS n_enc FROM enc GROUP BY grupo_id
  ),
  presentes AS (
    SELECT DISTINCT enc.grupo_id, p.membro_id
      FROM public.mem_grupo_encontro_presencas p
      JOIN enc ON enc.id = p.encontro_id
     WHERE p.presente = true
  ),
  -- Candidatos = roster ativo (só participantes · nunca liderança) dos grupos
  -- que registraram encontro, sem NENHUMA presença na temporada.
  sem AS (
    SELECT gce.grupo_id, gce.n_enc,
           mm.id AS participacao_id, mm.membro_id, mm.entrou_em,
           m.nome, m.telefone, m.foto_url
      FROM grupos_com_enc gce
      JOIN public.mem_grupo_membros mm ON mm.grupo_id = gce.grupo_id
       AND mm.saiu_em IS NULL AND mm.deleted_at IS NULL
       AND COALESCE(mm.funcao::text, 'frequentador') NOT IN ('lider', 'co_lider', 'lider_treinamento')
      JOIN ga ON ga.id = gce.grupo_id
      LEFT JOIN public.mem_membros m ON m.id = mm.membro_id
      LEFT JOIN presentes pr ON pr.grupo_id = mm.grupo_id AND pr.membro_id = mm.membro_id
     WHERE pr.membro_id IS NULL
       AND mm.membro_id IS DISTINCT FROM ga.lider_id
  )
  SELECT COALESCE(jsonb_agg(g ORDER BY (g->>'grupo_nome')), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'grupo_id', s.grupo_id,
               'grupo_nome', ga.nome,
               'grupo_codigo', ga.codigo,
               'total_encontros', s.n_enc,
               'membros', jsonb_agg(
                 jsonb_build_object(
                   'participacao_id', s.participacao_id,
                   'membro_id', s.membro_id,
                   'nome', s.nome,
                   'telefone', s.telefone,
                   'foto_url', s.foto_url,
                   'entrou_em', s.entrou_em
                 ) ORDER BY s.nome
               )
             ) AS g
        FROM sem s
        JOIN ga ON ga.id = s.grupo_id
       GROUP BY s.grupo_id, ga.nome, ga.codigo, s.n_enc
    ) q;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_temporada_sem_presenca(text) TO authenticated, service_role;

-- Conferência (Studio):
-- SELECT public.fn_temporada_sem_presenca('T2-2026');
-- ============================================================================
