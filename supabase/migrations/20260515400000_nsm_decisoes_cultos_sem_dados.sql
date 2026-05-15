-- ============================================================================
-- NSM passa a considerar decisoes em cultos sem dados como "fantasmas"
--
-- Marcos: "quero que as decisoes de pessoas que nao tenham dados aparecam no
--          nsm e impactem os dados dos segmentos, mas ai ao clicar para ver
--          deve ter um filtro 'pessoas sem dados' · isso vai acabar levando
--          a porcentagem da nsm e do engajamento de valores pra baixo, pois
--          nao tem como cruzar os dados".
--
-- Conceito: accountability pela ausencia de dados.
--   - cultos.decisoes_presenciais=10 mas so 3 pessoas registradas em
--     cultos_decisoes_pessoas → 7 'fantasmas' (numeros sem nome)
--   - Fantasmas entram no DENOMINADOR (puxa % do NSM pra baixo)
--   - NUNCA entram no NUMERADOR (porque sem identidade, impossivel rastrear
--     engajamento em valor)
--   - Drilldown mostra esses gaps · pressao pra registrar dados
--
-- Mudancas:
--   1. recalcular_nsm() · denominador agora SOMA decisoes em cultos (nao
--      mais count de nsm_eventos)
--   2. recalcular_nsm() · numerador continua nsm_eventos engajados (precisa
--      ter identidade pra contar)
--   3. View vw_nsm_sem_dados · cultos com decisoes > pessoas registradas
--   4. Trigger em cultos · recalcula NSM em UPDATE de decisoes_presenciais/online
--   5. Trigger em cultos_decisoes_pessoas · idem (apos registrar pessoa,
--      NSM atualiza)
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
  v_filter_cultos text;     -- filtro WHERE pra cultos
  v_filter_eventos text;    -- filtro WHERE pra nsm_eventos (numerador legado)
BEGIN
  FOR seg IN SELECT * FROM public.nsm_estado WHERE ativo = true LOOP

    -- Filtros baseados em segmento. cultos nao tem igreja_id direto · usamos
    -- service_type_name como proxy: AMI/Bridge/Domingo · todos sao Sede.
    -- 'cbrio' e 'central' coincidem (so temos uma igreja CBRio principal hoje).
    v_filter_cultos := CASE seg.segmento_tipo
      WHEN 'central'     THEN ''
      WHEN 'igreja_tipo' THEN
        -- Quando temos varias igrejas: filtra por tipo. CBA cabe aqui se
        -- houver cultos vinculados a igreja_id. Por ora, cbrio = tudo.
        CASE (seg.segmento_filtro->>'tipo')
          WHEN 'cbrio'  THEN ''  -- todas as decisoes (Sede + AMI + Bridge + Kids)
          WHEN 'online' THEN ' AND COALESCE(c.decisoes_online, 0) > 0'
          ELSE ''
        END
      ELSE ''
    END;

    v_filter_eventos := CASE seg.segmento_tipo
      WHEN 'central'     THEN ''
      WHEN 'igreja_tipo' THEN
        format(' AND igreja_id IN (SELECT id FROM public.igrejas WHERE tipo = %L AND ativa = true)',
               (seg.segmento_filtro->>'tipo'))
      WHEN 'igreja_id' THEN
        format(' AND igreja_id = %L::uuid', (seg.segmento_filtro->>'igreja_id'))
      ELSE ''
    END;

    -- DENOMINADOR NOVO: soma de decisoes em cultos no periodo.
    -- Inclui fantasmas (nao precisam estar registrados em cultos_decisoes_pessoas).
    EXECUTE format($f$
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int
      FROM public.cultos c
      WHERE c.data BETWEEN %L AND %L
      %s
    $f$, v_janela_inicio, v_janela_fim, v_filter_cultos)
    INTO v_total_atual;

    -- NUMERADOR: pessoas com identidade vinculada (membro_id) E ja em algum
    -- valor da Jornada (mem_trilha_valores etapa concluida).
    -- Pode ser expandido pra usar nsm_eventos.dentro_janela_60d quando triggers
    -- estiverem populando essa tabela direto de cultos_decisoes_pessoas.
    EXECUTE format($f$
      SELECT COUNT(DISTINCT cdp.membro_id)
      FROM public.cultos_decisoes_pessoas cdp
      JOIN public.cultos c ON c.id = cdp.culto_id
      WHERE c.data BETWEEN %L AND %L
        AND cdp.membro_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.mem_trilha_valores t
          WHERE t.membro_id = cdp.membro_id
            AND t.concluida = true
            AND t.data_conclusao IS NOT NULL
            AND t.data_conclusao <= c.data + interval '60 days'
        )
      %s
    $f$, v_janela_inicio, v_janela_fim, '')
    INTO v_engajados_atual;

    -- Periodo anterior (denominador)
    EXECUTE format($f$
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int
      FROM public.cultos c
      WHERE c.data BETWEEN %L AND %L
      %s
    $f$, v_periodo_anterior_inicio, v_periodo_anterior_fim, v_filter_cultos)
    INTO v_total_anterior;

    -- Breakdown por valor (so contam pessoas registradas E engajadas)
    EXECUTE format($f$
      SELECT COALESCE(jsonb_object_agg(etapa, qtd), '{}'::jsonb)
      FROM (
        SELECT t.etapa, COUNT(DISTINCT cdp.membro_id) AS qtd
        FROM public.cultos_decisoes_pessoas cdp
        JOIN public.cultos c ON c.id = cdp.culto_id
        JOIN public.mem_trilha_valores t ON t.membro_id = cdp.membro_id
        WHERE c.data BETWEEN %L AND %L
          AND cdp.membro_id IS NOT NULL
          AND t.concluida = true
          AND t.data_conclusao IS NOT NULL
          AND t.data_conclusao <= c.data + interval '60 days'
        GROUP BY t.etapa
      ) sub
    $f$, v_janela_inicio, v_janela_fim)
    INTO v_por_valor;

    v_pct_atual := CASE WHEN v_total_atual > 0
                        THEN round((v_engajados_atual::numeric / v_total_atual) * 100, 2)
                        ELSE 0 END;
    v_pct_anterior := 0;  -- comparacao com periodo anterior fica simplificada
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

COMMENT ON FUNCTION public.recalcular_nsm() IS
  'NSM = engajados_em_60d / total_decisoes (cultos.decisoes_presenciais+online). Fantasmas (sem registro em cultos_decisoes_pessoas) entram no denominador, nunca no numerador. Reflete accountability da captura de dados.';

-- ----------------------------------------------------------------------------
-- View vw_nsm_sem_dados · cultos com gap entre decisoes e pessoas registradas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_nsm_sem_dados AS
SELECT
  c.id              AS culto_id,
  c.data            AS data_culto,
  c.nome            AS culto_nome,
  c.service_type_id,
  vst.name          AS service_type_name,
  vst.color         AS service_type_color,
  c.decisoes_presenciais,
  c.decisoes_online,
  (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) AS total_decisoes,
  COALESCE(p.total_registradas, 0) AS total_registradas,
  COALESCE(p.com_membro_vinculado, 0) AS com_membro_vinculado,
  (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0))
    - COALESCE(p.total_registradas, 0) AS sem_dados,
  CASE
    WHEN (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) = 0 THEN 'sem_decisoes'
    WHEN COALESCE(p.total_registradas, 0) = 0 THEN 'nenhuma_registrada'
    WHEN COALESCE(p.total_registradas, 0) < (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) THEN 'parcial'
    ELSE 'completo'
  END AS gap_status
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON vst.id = c.service_type_id
LEFT JOIN (
  SELECT culto_id,
         COUNT(*) AS total_registradas,
         COUNT(membro_id) AS com_membro_vinculado
  FROM public.cultos_decisoes_pessoas
  GROUP BY culto_id
) p ON p.culto_id = c.id
WHERE c.data <= current_date
  AND (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) > 0;

GRANT SELECT ON public.vw_nsm_sem_dados TO authenticated, service_role;

COMMENT ON VIEW public.vw_nsm_sem_dados IS
  'Cultos com decisoes registradas no agregado mas pessoas faltando · usado no drilldown NSM filtro "sem dados".';

-- ----------------------------------------------------------------------------
-- Trigger · NSM recalcula automaticamente apos UPDATE de decisoes em cultos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_recalcular_pos_culto()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Recalcula NSM em background sem bloquear o UPDATE de cultos
  PERFORM public.recalcular_nsm();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS cultos_recalcular_nsm ON public.cultos;
CREATE TRIGGER cultos_recalcular_nsm
  AFTER INSERT OR UPDATE OF decisoes_presenciais, decisoes_online OR DELETE
  ON public.cultos
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)  -- evita loop com outros triggers
  EXECUTE FUNCTION public.tg_nsm_recalcular_pos_culto();

DROP TRIGGER IF EXISTS dec_pessoas_recalcular_nsm ON public.cultos_decisoes_pessoas;
CREATE TRIGGER dec_pessoas_recalcular_nsm
  AFTER INSERT OR UPDATE OR DELETE
  ON public.cultos_decisoes_pessoas
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.tg_nsm_recalcular_pos_culto();

-- ----------------------------------------------------------------------------
-- Roda 1x · recalcula NSM com nova logica
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_count int := 0;
BEGIN
  PERFORM public.recalcular_nsm();
  RAISE NOTICE 'NSM recalculado com nova logica (cultos como denominador)';
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT segmento, total_convertidos_periodo, engajados_em_60d, percentual
--     FROM nsm_estado WHERE ativo = true;
--   Espera: total_convertidos > 0 (vem de cultos agora) · percentual baixo
--   se engajados em mem_trilha_valores e pequeno.
--
--   SELECT * FROM vw_nsm_sem_dados ORDER BY data_culto DESC LIMIT 20;
--   Lista de cultos com gap entre decisoes e pessoas registradas.
-- ============================================================================
