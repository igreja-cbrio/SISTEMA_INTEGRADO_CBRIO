-- ============================================================================
-- NSM · numerador passa a medir ENGAJAMENTO REAL pós-decisão
--
-- Marcos (2026-06-10): "precisa ser 0 mesmo, até que o convertido entre em
-- outro valor. Os números devem apontar o correto, não o que queremos."
--
-- Problema: o numerador de recalcular_nsm() contava pessoa nominal com
-- QUALQUER etapa concluída em mem_trilha_valores em ≤60d — e a etapa
-- 'conversao' nasce concluída no ato da decisão, então TODO cadastro nominal
-- contava como "engajado" (na prática o card media "% das decisões com pessoa
-- cadastrada", não engajamento · 21/240 = 8,75% falsos).
--
-- Novo critério (o MESMO da tela /painel/nsm/pessoas · um único critério no
-- sistema): convertido engajado = sinal real em ≥1 valor dentro de
-- [decisão, decisão+60d]:
--   seguir       · trilha primeiro_contato/batismo concluída · batismo
--                  realizado (batismo_inscricoes) · Next com check-in
--   conectar     · entrou em grupo (mem_grupo_membros · ainda ativo)
--   investir     · devocional concluído · encontro Jornada 180 · aconselhamento
--   servir       · virou voluntário (mem_voluntarios · ainda ativo)
--   generosidade · contribuição dízimo/oferta
--
-- Também o por_valor (breakdown do card) passa a usar o mesmo critério — as
-- chaves viram os 5 valores (antes eram etapas da trilha · nada no frontend
-- consome o por_valor do nsm_estado hoje, mudança segura).
--
-- Denominador NÃO muda: total de decisões agregadas dos cultos na janela
-- móvel de 90d (fantasmas continuam puxando o % pra baixo · accountability).
--
-- ⚠️ Efeito esperado HOJE: engajados cai de 21 pra 0 (nenhum convertido da
-- janela tem sinal pós-decisão ainda) — é o número honesto que o Marcos pediu.
-- Sobe conforme a esteira pastoral + módulos dos valores forem usados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper · valores em que o membro engajou dentro da janela pós-decisão
--    (espelha exatamente o nsmAtividades/enriquecimento de backend/routes/painel.js)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_nsm_valores_engajados(
  p_membro_id uuid,
  p_data_decisao date,
  p_janela_dias int DEFAULT 60
) RETURNS text[]
LANGUAGE sql STABLE
AS $$
  SELECT array_remove(ARRAY[
    -- SEGUIR · 1º contato/batismo na trilha, batismo realizado ou Next com check-in
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mem_trilha_valores t
       WHERE t.membro_id = p_membro_id AND t.deleted_at IS NULL
         AND t.concluida = true
         AND t.etapa IN ('primeiro_contato', 'batismo')
         AND t.data_conclusao BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) OR EXISTS (
      SELECT 1 FROM public.batismo_inscricoes b
       WHERE b.membro_id = p_membro_id AND b.status = 'realizado'
         AND b.data_batismo BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) OR EXISTS (
      SELECT 1 FROM public.next_inscricoes n
       WHERE n.membro_id = p_membro_id AND n.check_in_at IS NOT NULL
         AND n.check_in_at::date BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) THEN 'seguir' END,

    -- CONECTAR · entrou em grupo (ainda ativo)
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mem_grupo_membros g
       WHERE g.membro_id = p_membro_id AND g.deleted_at IS NULL
         AND g.saiu_em IS NULL
         AND g.entrou_em BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) THEN 'conectar' END,

    -- INVESTIR · devocional concluído, Jornada 180 ou aconselhamento
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mem_devocionais d
       WHERE d.membro_id = p_membro_id AND d.concluida = true
         AND d.data_devocional BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) OR EXISTS (
      SELECT 1 FROM public.cui_jornada180 j
       WHERE j.membro_id = p_membro_id AND j.deleted_at IS NULL
         AND j.presente IS DISTINCT FROM false
         AND j.data_encontro BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) OR EXISTS (
      SELECT 1 FROM public.cui_acompanhamentos a
       WHERE a.membro_id = p_membro_id
         AND a.data_inicio BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) THEN 'investir' END,

    -- SERVIR · virou voluntário (ainda ativo)
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mem_voluntarios v
       WHERE v.membro_id = p_membro_id AND v.deleted_at IS NULL
         AND v.ate IS NULL
         AND v.desde BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) THEN 'servir' END,

    -- GENEROSIDADE · contribuição dízimo/oferta
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mem_contribuicoes c
       WHERE c.membro_id = p_membro_id AND c.deleted_at IS NULL
         AND c.tipo IN ('dizimo', 'oferta')
         AND c.data BETWEEN p_data_decisao
             AND LEAST(p_data_decisao + p_janela_dias, current_date)
    ) THEN 'generosidade' END
  ], NULL)
$$;

GRANT EXECUTE ON FUNCTION public.fn_nsm_valores_engajados(uuid, date, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_nsm_valores_engajados(uuid, date, int) IS
  'Valores da CBRio em que o membro engajou dentro de [decisão, decisão+N dias] (sinais reais pós-decisão · critério único da NSM, espelha a tela /painel/nsm/pessoas).';

-- ----------------------------------------------------------------------------
-- 2. recalcular_nsm v3 · numerador e por_valor pelo critério real
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_nsm()
RETURNS TABLE (
  segmento_processado text,
  convertidos int,
  engajados int,
  percentual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seg RECORD;
  v_janela_inicio date := (current_date - interval '90 days')::date;
  v_janela_fim    date := current_date;
  v_periodo_anterior_inicio date := (current_date - interval '180 days')::date;
  v_periodo_anterior_fim    date := (current_date - interval '90 days')::date;
  v_total_atual int;
  v_engajados_atual int;
  v_total_anterior int;
  v_pct_atual numeric;
  v_delta numeric;
  v_por_valor jsonb;
  v_filter_cultos text;
BEGIN
  FOR seg IN SELECT * FROM public.nsm_estado WHERE ativo = true LOOP

    -- Filtro do segmento (cultos) · cbrio/central = tudo · online = cultos
    -- com decisão online (mesma regra da v2 · 20260515400000)
    v_filter_cultos := CASE seg.segmento_tipo
      WHEN 'central'     THEN ''
      WHEN 'igreja_tipo' THEN
        CASE (seg.segmento_filtro->>'tipo')
          WHEN 'cbrio'  THEN ''
          WHEN 'online' THEN ' AND COALESCE(c.decisoes_online, 0) > 0'
          ELSE ''
        END
      ELSE ''
    END;

    -- DENOMINADOR (inalterado): soma das decisões agregadas dos cultos.
    -- Fantasmas (decisão sem pessoa cadastrada) continuam contando.
    EXECUTE format($f$
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int
      FROM public.cultos c
      WHERE c.data BETWEEN %L AND %L
      %s
    $f$, v_janela_inicio, v_janela_fim, v_filter_cultos)
    INTO v_total_atual;

    -- NUMERADOR (novo): convertido nominal com sinal REAL em ≥1 valor dentro
    -- de [decisão, decisão+60d] · critério único (fn_nsm_valores_engajados).
    SELECT COUNT(DISTINCT cdp.membro_id)
      INTO v_engajados_atual
      FROM public.cultos_decisoes_pessoas cdp
      JOIN public.cultos c ON c.id = cdp.culto_id
     WHERE c.data BETWEEN v_janela_inicio AND v_janela_fim
       AND cdp.membro_id IS NOT NULL
       AND cardinality(public.fn_nsm_valores_engajados(cdp.membro_id, c.data, 60)) > 0;

    -- Período anterior (denominador · inalterado)
    EXECUTE format($f$
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int
      FROM public.cultos c
      WHERE c.data BETWEEN %L AND %L
      %s
    $f$, v_periodo_anterior_inicio, v_periodo_anterior_fim, v_filter_cultos)
    INTO v_total_anterior;

    -- Breakdown por VALOR (novo · chaves = seguir/conectar/investir/servir/
    -- generosidade · pessoas distintas por valor)
    SELECT COALESCE(jsonb_object_agg(valor, qtd), '{}'::jsonb)
      INTO v_por_valor
      FROM (
        SELECT v.valor, COUNT(DISTINCT cdp.membro_id) AS qtd
          FROM public.cultos_decisoes_pessoas cdp
          JOIN public.cultos c ON c.id = cdp.culto_id
          CROSS JOIN LATERAL unnest(public.fn_nsm_valores_engajados(cdp.membro_id, c.data, 60)) AS v(valor)
         WHERE c.data BETWEEN v_janela_inicio AND v_janela_fim
           AND cdp.membro_id IS NOT NULL
         GROUP BY v.valor
      ) sub;

    v_pct_atual := CASE WHEN v_total_atual > 0
                        THEN round((v_engajados_atual::numeric / v_total_atual) * 100, 2)
                        ELSE 0 END;
    v_delta := v_pct_atual - 0; -- comparação simplificada (como na v2)

    UPDATE public.nsm_estado
       SET total_convertidos_periodo = v_total_atual,
           engajados_em_60d          = v_engajados_atual,
           percentual                = v_pct_atual,
           total_periodo_anterior    = v_total_anterior,
           delta_vs_mes_anterior     = v_delta,
           por_valor                 = v_por_valor,
           janela_inicio             = v_janela_inicio,
           janela_fim                = v_janela_fim,
           atualizado_em             = now()
     WHERE segmento = seg.segmento;

    segmento_processado := seg.segmento;
    convertidos         := v_total_atual;
    engajados           := v_engajados_atual;
    percentual          := v_pct_atual;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_nsm() TO authenticated, service_role;

COMMENT ON FUNCTION public.recalcular_nsm() IS
  'NSM v3 = engajados reais (sinal em ≥1 valor em ≤60d da decisão · fn_nsm_valores_engajados) ÷ total de decisões agregadas dos cultos (90d · fantasmas contam). Critério único com a tela /painel/nsm/pessoas.';

-- ----------------------------------------------------------------------------
-- 3. Recalcula agora com o critério novo
-- ----------------------------------------------------------------------------
SELECT * FROM public.recalcular_nsm();

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT segmento, total_convertidos_periodo, engajados_em_60d, percentual,
--          por_valor FROM nsm_estado WHERE ativo = true;
--   -- esperado hoje: central 240 · engajados 0 · 0% (números honestos)
-- ----------------------------------------------------------------------------
