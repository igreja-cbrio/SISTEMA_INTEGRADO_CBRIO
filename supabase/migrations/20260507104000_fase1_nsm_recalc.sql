-- ============================================================================
-- FASE 1 · Funcao de Recalculo NSM
--
-- Funcao publica `recalcular_nsm()` que percorre todos os segmentos ativos
-- em nsm_estado e atualiza:
--   - total_convertidos_periodo (denominador)
--   - engajados_em_60d (numerador)
--   - percentual
--   - delta_vs_mes_anterior
--   - por_valor (breakdown JSON)
--   - atualizado_em
--
-- Como rodar:
--   - Manual:  SELECT public.recalcular_nsm();
--   - Cron:    SELECT cron.schedule('nsm-hourly', '0 * * * *', 'SELECT public.recalcular_nsm()');
--   - Trigger: chamada por triggers de inserts em nsm_eventos (opcional, custoso)
--
-- DEPENDENCIA DE FASE 1.5:
-- A funcao depende de TRIGGERS nas tabelas de origem (batismo, devocional,
-- grupo, voluntariado, doacao) que populam nsm_eventos. Esses triggers
-- ainda nao existem — vao ser criados em migration separada da Fase 1.5
-- (`20260507105000_fase1_nsm_triggers.sql`) depois de inspecionar cada
-- tabela de origem (alguns ja tem triggers, nao podemos quebrar).
--
-- Por enquanto a funcao funciona com nsm_eventos vazia: retorna 0 para
-- todos os segmentos. Conforme triggers entram, numeros aparecem.
-- ============================================================================

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
  v_pct_anterior numeric;
  v_delta numeric;
  v_por_valor jsonb;
  v_filter_sql text;
BEGIN
  FOR seg IN SELECT * FROM public.nsm_estado WHERE ativo = true LOOP

    -- Construir filtro WHERE conforme tipo de segmento
    v_filter_sql := CASE seg.segmento_tipo
      WHEN 'central' THEN ''
      WHEN 'igreja_tipo' THEN
        format(' AND igreja_id IN (SELECT id FROM public.igrejas WHERE tipo = %L AND ativa = true)',
               (seg.segmento_filtro->>'tipo'))
      WHEN 'igreja_id' THEN
        format(' AND igreja_id = %L::uuid', (seg.segmento_filtro->>'igreja_id'))
      ELSE ''
    END;

    -- Total convertidos no periodo (decisao nos ultimos 90 dias)
    EXECUTE format($f$
      SELECT count(DISTINCT COALESCE(membro_id::text, visitante_id::text, cpf))
      FROM public.nsm_eventos
      WHERE data_decisao BETWEEN %L AND %L
      %s
    $f$, v_janela_inicio, v_janela_fim, v_filter_sql)
    INTO v_total_atual;

    -- Engajados em ≤60d (numerador)
    EXECUTE format($f$
      SELECT count(DISTINCT COALESCE(membro_id::text, visitante_id::text, cpf))
      FROM public.nsm_eventos
      WHERE data_decisao BETWEEN %L AND %L
        AND dentro_janela_60d = true
      %s
    $f$, v_janela_inicio, v_janela_fim, v_filter_sql)
    INTO v_engajados_atual;

    -- Periodo anterior (mesma janela 90d antes)
    EXECUTE format($f$
      SELECT count(DISTINCT COALESCE(membro_id::text, visitante_id::text, cpf))
      FROM public.nsm_eventos
      WHERE data_decisao BETWEEN %L AND %L
        AND dentro_janela_60d = true
      %s
    $f$, v_periodo_anterior_inicio, v_periodo_anterior_fim, v_filter_sql)
    INTO v_total_anterior;

    -- Breakdown por valor (JSON)
    EXECUTE format($f$
      SELECT coalesce(jsonb_object_agg(valor_engajado, qtd), '{}'::jsonb)
      FROM (
        SELECT valor_engajado, count(DISTINCT COALESCE(membro_id::text, visitante_id::text, cpf)) AS qtd
        FROM public.nsm_eventos
        WHERE data_decisao BETWEEN %L AND %L
          AND dentro_janela_60d = true
        %s
        GROUP BY valor_engajado
      ) sub
    $f$, v_janela_inicio, v_janela_fim, v_filter_sql)
    INTO v_por_valor;

    v_pct_atual := CASE WHEN v_total_atual > 0
                        THEN round((v_engajados_atual::numeric / v_total_atual) * 100, 2)
                        ELSE 0 END;
    v_pct_anterior := CASE WHEN v_total_anterior > 0
                           THEN round((v_total_anterior::numeric / v_total_anterior) * 100, 2)
                           ELSE 0 END;
    v_delta := v_pct_atual - v_pct_anterior;

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

-- ----------------------------------------------------------------------------
-- View: NSM consolidada (1 linha pronta para o painel)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_nsm_painel AS
SELECT
  s.segmento,
  s.segmento_label,
  s.segmento_tipo,
  s.total_convertidos_periodo,
  s.engajados_em_60d,
  s.percentual,
  s.meta_percentual,
  s.delta_vs_mes_anterior,
  s.por_valor,
  s.janela_inicio,
  s.janela_fim,
  s.atualizado_em,
  CASE
    WHEN s.percentual >= s.meta_percentual THEN 'verde'
    WHEN s.percentual >= s.meta_percentual * 0.85 THEN 'amarelo'
    ELSE 'vermelho'
  END AS status
FROM public.nsm_estado s
WHERE s.ativo = true
ORDER BY
  CASE s.segmento
    WHEN 'central' THEN 1
    WHEN 'cbrio'   THEN 2
    WHEN 'online'  THEN 3
    WHEN 'cba'     THEN 4
    ELSE 9
  END;

GRANT SELECT ON public.vw_nsm_painel TO authenticated, service_role;

COMMENT ON FUNCTION public.recalcular_nsm IS 'Recalcula nsm_estado para todos os segmentos ativos. Janela default = 90 dias. Roda em cron horario ou sob demanda.';
COMMENT ON VIEW public.vw_nsm_painel IS 'NSM consolidada para o painel. Inclui status (verde/amarelo/vermelho) calculado contra meta_percentual.';
