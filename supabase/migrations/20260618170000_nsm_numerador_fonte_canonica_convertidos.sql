-- ============================================================================
-- NSM · numerador passa a ler a FONTE CANÔNICA de convertido (cui_convertidos)
-- ============================================================================
-- Diagnóstico (auditoria 2026-06-18, contra o banco vivo):
--   A população real de convertidos vive em `cui_convertidos` (314 ativos · 303
--   com membro_id válido). Mas o numerador da NSM e o drilldown liam
--   `cultos_decisoes_pessoas` (26 linhas, só de 20/mai–14/jun) → as duas listas
--   só se sobrepõem em 23 pessoas, então ~276 convertidos identificados ficavam
--   INVISÍVEIS pra NSM e o engajamento dava 0 em todos os segmentos.
--
-- Correção (mínima e cirúrgica):
--   - NUMERADOR e BREAKDOWN por valor passam a varrer `cui_convertidos`
--     (por membro_id · data de referência = data_culto da conversão), mantendo
--     EXATAMENTE a mesma regra de "engajado" (fn_nsm_valores_engajados, janela 60d).
--   - DENOMINADOR continua = soma de decisões dos cultos (inclui "fantasmas" sem
--     nome cadastrado) · decisão do Marcos: a ausência de dado puxa o % pra baixo
--     e cobra a equipe a registrar quem decidiu. NÃO muda.
--   - Segmento 'online' filtra por cui_convertidos.area = 'online' (espelha o
--     filtro de decisoes_online do denominador).
--   - COUNT(DISTINCT membro_id) já deduplica convertidos repetidos no mesmo membro.
--   - membro_id NULL (órfãos) fica de fora do numerador até a reconciliação (Fase 1).
--
-- Idempotente · CREATE OR REPLACE + re-run. Não toca schema, não dropa nada.
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
  v_delta numeric;
  v_por_valor jsonb;
  v_filter_cultos text;   -- filtro WHERE do denominador (cultos)
  v_area_filtro   text;   -- filtro de area pro numerador (cui_convertidos)
BEGIN
  FOR seg IN SELECT * FROM public.nsm_estado WHERE ativo = true LOOP

    -- Filtro do denominador (cultos · agregado de decisões · inclui fantasmas)
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

    -- Filtro de area equivalente pro numerador (cui_convertidos)
    v_area_filtro := CASE
      WHEN seg.segmento_tipo = 'igreja_tipo' AND (seg.segmento_filtro->>'tipo') = 'online'
        THEN 'online'
      ELSE NULL
    END;

    -- DENOMINADOR (inalterado): soma de decisões nos cultos no período.
    EXECUTE format($f$
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int
      FROM public.cultos c
      WHERE c.data BETWEEN %L AND %L
      %s
    $f$, v_janela_inicio, v_janela_fim, v_filter_cultos)
    INTO v_total_atual;

    -- NUMERADOR (RE-APONTADO): convertidos identificados (cui_convertidos) que
    -- engajaram em >=1 valor da Jornada em até 60d da conversão.
    SELECT COUNT(DISTINCT cv.membro_id)
      INTO v_engajados_atual
      FROM public.cui_convertidos cv
     WHERE cv.deleted_at IS NULL
       AND cv.membro_id IS NOT NULL
       AND cv.data_culto BETWEEN v_janela_inicio AND v_janela_fim
       AND (v_area_filtro IS NULL OR cv.area = v_area_filtro)
       AND cardinality(public.fn_nsm_valores_engajados(cv.membro_id, cv.data_culto, 60)) > 0;

    -- Período anterior (denominador · inalterado)
    EXECUTE format($f$
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int
      FROM public.cultos c
      WHERE c.data BETWEEN %L AND %L
      %s
    $f$, v_periodo_anterior_inicio, v_periodo_anterior_fim, v_filter_cultos)
    INTO v_total_anterior;

    -- BREAKDOWN por valor (RE-APONTADO pra cui_convertidos · mesma regra/janela)
    SELECT COALESCE(jsonb_object_agg(valor, qtd), '{}'::jsonb)
      INTO v_por_valor
      FROM (
        SELECT v.valor, COUNT(DISTINCT cv.membro_id) AS qtd
          FROM public.cui_convertidos cv
          CROSS JOIN LATERAL unnest(public.fn_nsm_valores_engajados(cv.membro_id, cv.data_culto, 60)) AS v(valor)
         WHERE cv.deleted_at IS NULL
           AND cv.membro_id IS NOT NULL
           AND cv.data_culto BETWEEN v_janela_inicio AND v_janela_fim
           AND (v_area_filtro IS NULL OR cv.area = v_area_filtro)
         GROUP BY v.valor
      ) sub;

    v_pct_atual := CASE WHEN v_total_atual > 0
                        THEN round((v_engajados_atual::numeric / v_total_atual) * 100, 2)
                        ELSE 0 END;
    v_delta := v_pct_atual - 0;

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

COMMENT ON FUNCTION public.recalcular_nsm() IS
  'NSM = engajados_em_60d / total_decisoes. Numerador e breakdown leem cui_convertidos (fonte canônica do convertido, por membro_id · engajamento via fn_nsm_valores_engajados, janela 60d). Denominador = soma de decisões dos cultos (inclui fantasmas sem nome · accountability da captura).';

-- Recalcula já com a nova lógica
DO $$
BEGIN
  PERFORM public.recalcular_nsm();
  RAISE NOTICE 'NSM recalculado · numerador agora lê cui_convertidos (fonte canônica).';
END $$;
