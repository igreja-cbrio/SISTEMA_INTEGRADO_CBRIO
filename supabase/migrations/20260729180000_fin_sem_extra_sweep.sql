-- "Sem extraordinárias" em todas as abas de receita do Dashboard Semanal.
-- Estratégia (decidida por conselho): NÃO reescrever a lógica das views nem
-- tocar no caminho normal (toggle off = byte-a-byte igual). Só ADICIONA, ao
-- FINAL de cada view de receita, a coluna `receita_extraordinaria` (a MESMA
-- expressão de `receita`, mas FILTER classe='extraordinaria'), preservando o
-- WHERE/guardrail exato de cada uma. O backend subtrai essa coluna quando o
-- toggle liga e RECOMPUTA as métricas derivadas (resultado, ticket, YTD,
-- elasticidade). Semântica canônica (= Bloco 1 / Dízimo×Oferta): "sem extra"
-- remove só a RECEITA extraordinária (despesa/folha intactas).
--
-- CREATE OR REPLACE VIEW só permite ACRESCENTAR coluna no fim (nunca reordenar/
-- renomear) → todas as adições vão no final. A base arrecadacao_semanal é
-- recriada ANTES da dependente freq_vs_arrecadacao_semanal.
--
-- Idempotente: rodar de novo apenas reafirma as definições.

-- ── 1. vw_fin_arrecadacao_mensal ──────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_arrecadacao_mensal AS
 SELECT to_char(data_competencia::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    EXTRACT(year FROM data_competencia)::integer AS ano,
    EXTRACT(month FROM data_competencia)::integer AS mes_num,
    sum(CASE WHEN tipo = 'receita'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END) AS receita,
    sum(CASE WHEN tipo = 'despesa'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END) AS despesa,
    sum(CASE WHEN tipo = 'receita'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END)
      - sum(CASE WHEN tipo = 'despesa'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END) AS resultado,
    count(*) AS qtd,
    sum(CASE WHEN tipo = 'receita'::text AND classe_movimento = 'extraordinaria'::text THEN valor ELSE 0::numeric END) AS receita_extraordinaria
   FROM fin_transacoes t
  WHERE status <> 'cancelado'::text
  GROUP BY (to_char(data_competencia::timestamp with time zone, 'YYYY-MM'::text)), (EXTRACT(year FROM data_competencia)::integer), (EXTRACT(month FROM data_competencia)::integer);

-- ── 2. vw_fin_arrecadacao_semanal (BASE de freq_vs_arrecadacao_semanal) ────
CREATE OR REPLACE VIEW public.vw_fin_arrecadacao_semanal AS
 SELECT (fin_semana_qua_ter(data_competencia)).inicio AS semana_inicio,
    (fin_semana_qua_ter(data_competencia)).fim AS semana_fim,
    (fin_semana_qua_ter(data_competencia)).label AS semana_label,
    EXTRACT(year FROM (fin_semana_qua_ter(data_competencia)).inicio)::integer AS ano,
    sum(CASE WHEN tipo = 'receita'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END) AS receita,
    sum(CASE WHEN tipo = 'despesa'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END) AS despesa,
    sum(CASE WHEN tipo = 'receita'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END)
      - sum(CASE WHEN tipo = 'despesa'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) THEN valor ELSE 0::numeric END) AS resultado,
    sum(CASE WHEN classe_movimento = 'emprestimo'::text THEN valor ELSE 0::numeric END) AS movimento_emprestimo,
    sum(CASE WHEN classe_movimento = 'transferencia'::text THEN valor ELSE 0::numeric END) AS movimento_transferencia,
    count(*) AS qtd,
    sum(CASE WHEN tipo = 'receita'::text AND classe_movimento = 'extraordinaria'::text THEN valor ELSE 0::numeric END) AS receita_extraordinaria
   FROM fin_transacoes t
  WHERE status <> 'cancelado'::text
  GROUP BY ((fin_semana_qua_ter(data_competencia)).inicio), ((fin_semana_qua_ter(data_competencia)).fim), ((fin_semana_qua_ter(data_competencia)).label), (EXTRACT(year FROM (fin_semana_qua_ter(data_competencia)).inicio)::integer);

-- ── 3. vw_fin_freq_vs_arrecadacao_semanal (herda receita_extraordinaria) ───
CREATE OR REPLACE VIEW public.vw_fin_freq_vs_arrecadacao_semanal AS
 WITH semanas_arrec AS (
         SELECT vw_fin_arrecadacao_semanal.semana_inicio,
            vw_fin_arrecadacao_semanal.semana_fim,
            vw_fin_arrecadacao_semanal.semana_label,
            vw_fin_arrecadacao_semanal.ano,
            vw_fin_arrecadacao_semanal.receita,
            vw_fin_arrecadacao_semanal.despesa,
            vw_fin_arrecadacao_semanal.resultado,
            vw_fin_arrecadacao_semanal.qtd,
            vw_fin_arrecadacao_semanal.receita_extraordinaria
           FROM vw_fin_arrecadacao_semanal
        ), semanas_freq AS (
         SELECT (fin_semana_qua_ter(c.data)).inicio AS semana_inicio,
            sum(COALESCE(c.presencial_adulto, 0) + COALESCE(c.presencial_kids, 0)) AS presencial,
            sum(COALESCE(c.online_pico, 0)) AS online,
            sum(COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0) + COALESCE(c.decisoes_kids, 0)) AS decisoes,
            count(*) AS qtd_cultos
           FROM cultos c
          WHERE c.deleted_at IS NULL
          GROUP BY ((fin_semana_qua_ter(c.data)).inicio)
        )
 SELECT COALESCE(a.semana_inicio, f.semana_inicio) AS semana_inicio,
    a.semana_fim,
    a.semana_label,
    a.ano,
    COALESCE(a.receita, 0::numeric) AS receita,
    COALESCE(a.despesa, 0::numeric) AS despesa,
    COALESCE(a.resultado, 0::numeric) AS resultado,
    COALESCE(f.presencial, 0::bigint) AS presencial,
    COALESCE(f.online, 0::bigint) AS online,
    COALESCE(f.presencial, 0::bigint) + COALESCE(f.online, 0::bigint) AS total_freq,
    COALESCE(f.decisoes, 0::bigint) AS decisoes,
    COALESCE(f.qtd_cultos, 0::bigint) AS qtd_cultos,
        CASE
            WHEN COALESCE(f.presencial, 0::bigint) > 0 THEN COALESCE(a.receita, 0::numeric) / f.presencial::numeric
            ELSE 0::numeric
        END AS ticket_medio_presencial,
    COALESCE(a.receita_extraordinaria, 0::numeric) AS receita_extraordinaria
   FROM semanas_arrec a
     FULL JOIN semanas_freq f ON f.semana_inicio = a.semana_inicio;

-- ── 4. vw_fin_decendio ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_decendio AS
 SELECT to_char(data_competencia::timestamp with time zone, 'YYYY-MM'::text) AS mes,
        CASE WHEN EXTRACT(day FROM data_competencia) <= 10::numeric THEN 1 WHEN EXTRACT(day FROM data_competencia) <= 20::numeric THEN 2 ELSE 3 END AS decendio,
        CASE WHEN EXTRACT(day FROM data_competencia) <= 10::numeric THEN '1-10'::text WHEN EXTRACT(day FROM data_competencia) <= 20::numeric THEN '11-20'::text ELSE '21-fim'::text END AS decendio_label,
    sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END) AS receita,
    sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS despesa,
    count(*) AS qtd,
    sum(CASE WHEN tipo = 'receita'::text AND classe_movimento = 'extraordinaria'::text THEN valor ELSE 0::numeric END) AS receita_extraordinaria
   FROM fin_transacoes
  WHERE status <> 'cancelado'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text]))
  GROUP BY (to_char(data_competencia::timestamp with time zone, 'YYYY-MM'::text)),
        (CASE WHEN EXTRACT(day FROM data_competencia) <= 10::numeric THEN 1 WHEN EXTRACT(day FROM data_competencia) <= 20::numeric THEN 2 ELSE 3 END),
        (CASE WHEN EXTRACT(day FROM data_competencia) <= 10::numeric THEN '1-10'::text WHEN EXTRACT(day FROM data_competencia) <= 20::numeric THEN '11-20'::text ELSE '21-fim'::text END);

-- ── 5. vw_fin_ano_acumulado ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_ano_acumulado AS
 SELECT EXTRACT(year FROM data_competencia)::integer AS ano,
    sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END) AS receita_ytd,
    sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS despesa_ytd,
    sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END) - sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS resultado_ytd,
    count(*) AS qtd,
    sum(CASE WHEN tipo = 'receita'::text AND classe_movimento = 'extraordinaria'::text THEN valor ELSE 0::numeric END) AS receita_extraordinaria_ytd
   FROM fin_transacoes
  WHERE status <> 'cancelado'::text AND (classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text]))
  GROUP BY (EXTRACT(year FROM data_competencia)::integer);

-- ── 6. vw_fin_freq_vs_receita_mensal ──────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_freq_vs_receita_mensal AS
 WITH receita AS (
         SELECT to_char(fin_transacoes.data_competencia::timestamp with time zone, 'YYYY-MM'::text) AS mes,
            sum(CASE WHEN fin_transacoes.tipo = 'receita'::text THEN fin_transacoes.valor ELSE 0::numeric END) AS receita,
            sum(CASE WHEN fin_transacoes.tipo = 'receita'::text AND fin_transacoes.classe_movimento = 'extraordinaria'::text THEN fin_transacoes.valor ELSE 0::numeric END) AS receita_extra
           FROM fin_transacoes
          WHERE fin_transacoes.status <> 'cancelado'::text AND (fin_transacoes.classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text]))
          GROUP BY (to_char(fin_transacoes.data_competencia::timestamp with time zone, 'YYYY-MM'::text))
        ), freq AS (
         SELECT to_char(cultos.data::timestamp with time zone, 'YYYY-MM'::text) AS mes,
            sum(COALESCE(cultos.presencial_adulto, 0) + COALESCE(cultos.presencial_kids, 0)) AS presencial,
            sum(COALESCE(cultos.online_pico, 0)) AS online
           FROM cultos
          WHERE cultos.deleted_at IS NULL
          GROUP BY (to_char(cultos.data::timestamp with time zone, 'YYYY-MM'::text))
        )
 SELECT COALESCE(r.mes, f.mes) AS mes,
    COALESCE(r.receita, 0::numeric) AS receita,
    COALESCE(f.presencial, 0::bigint) AS presencial,
    COALESCE(f.online, 0::bigint) AS online,
    COALESCE(f.presencial, 0::bigint) + COALESCE(f.online, 0::bigint) AS total_freq,
        CASE WHEN COALESCE(f.presencial, 0::bigint) > 0 THEN r.receita / f.presencial::numeric ELSE 0::numeric END AS ticket_medio_presencial,
    COALESCE(r.receita_extra, 0::numeric) AS receita_extraordinaria
   FROM receita r
     FULL JOIN freq f ON r.mes = f.mes;

-- ── 7. vw_fin_semana_resumo ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_semana_resumo AS
 WITH cultos_sem AS (
         SELECT (fin_semana_qua_ter(c_1.data)).inicio AS semana_inicio,
            (fin_semana_qua_ter(c_1.data)).fim AS semana_fim,
            (fin_semana_qua_ter(c_1.data)).label AS semana_label,
            sum(COALESCE(c_1.presencial_adulto, 0) + COALESCE(c_1.presencial_kids, 0)) AS total_presencial,
            sum(COALESCE(c_1.online_pico, 0)) AS total_online,
            count(*) AS qtd_cultos
           FROM cultos c_1
          WHERE c_1.deleted_at IS NULL
          GROUP BY ((fin_semana_qua_ter(c_1.data)).inicio), ((fin_semana_qua_ter(c_1.data)).fim), ((fin_semana_qua_ter(c_1.data)).label)
        ), receita_sem AS (
         SELECT (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
            sum(t.valor) AS receita_total,
            sum(t.valor) FILTER (WHERE t.classe_movimento = 'extraordinaria'::text) AS receita_extra_total
           FROM fin_transacoes t
          WHERE t.tipo = 'receita'::text AND t.status <> 'cancelado'::text AND (t.classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text])) AND (t.lancamento_bruto_id IS NULL OR t.codigo_legado IS NOT NULL)
          GROUP BY ((fin_semana_qua_ter(t.data_competencia)).inicio)
        )
 SELECT COALESCE(c.semana_inicio, r.semana_inicio) AS semana_inicio,
    c.semana_fim,
    c.semana_label,
    COALESCE(c.qtd_cultos, 0::bigint) AS qtd_cultos,
    COALESCE(c.total_presencial, 0::bigint) AS total_presencial,
    COALESCE(c.total_online, 0::bigint) AS total_online,
    COALESCE(r.receita_total, 0::numeric) AS receita_total,
        CASE WHEN COALESCE(c.total_presencial, 0::bigint) > 0 THEN COALESCE(r.receita_total, 0::numeric) / c.total_presencial::numeric ELSE 0::numeric END AS ticket_medio_presencial,
    COALESCE(r.receita_extra_total, 0::numeric) AS receita_extraordinaria
   FROM cultos_sem c
     FULL JOIN receita_sem r ON r.semana_inicio = c.semana_inicio;

-- ── 8. RPC fin_saude_financeira · +p_sem_extra (aplica só na RECEITA) ──────
DROP FUNCTION IF EXISTS public.fin_saude_financeira(integer);
CREATE OR REPLACE FUNCTION public.fin_saude_financeira(p_ano integer DEFAULT NULL::integer, p_sem_extra boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ano int := COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  v_mes_atual text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_receita_ytd numeric; v_despesa_ytd numeric;
  v_receita_mes numeric; v_despesa_mes numeric;
  v_folha_ytd numeric;
  v_meses_vermelho int; v_meses_com_dado int;
  v_top20_pct numeric; v_top10_pct numeric; v_qtd_doadores int;
  v_resultado_12m numeric;
BEGIN
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND (NOT p_sem_extra OR classe_movimento='ordinaria')), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo='despesa'), 0)
  INTO v_receita_ytd, v_despesa_ytd
  FROM fin_transacoes
  WHERE classe_movimento IN ('ordinaria','extraordinaria') AND status<>'cancelado'
    AND EXTRACT(YEAR FROM data_competencia) = v_ano;

  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND (NOT p_sem_extra OR classe_movimento='ordinaria')), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo='despesa'), 0)
  INTO v_receita_mes, v_despesa_mes
  FROM fin_transacoes
  WHERE classe_movimento IN ('ordinaria','extraordinaria') AND status<>'cancelado'
    AND to_char(data_competencia, 'YYYY-MM') = v_mes_atual;

  SELECT COALESCE(SUM(t.valor), 0) INTO v_folha_ytd
  FROM fin_transacoes t JOIN fin_plano_contas pc ON pc.id=t.plano_contas_id
  WHERE t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria')
    AND t.status<>'cancelado' AND EXTRACT(YEAR FROM t.data_competencia)=v_ano
    AND pc.codigo LIKE '4.01%';

  SELECT
    COUNT(*) FILTER (WHERE res < 0), COUNT(*), COALESCE(SUM(res), 0)
  INTO v_meses_vermelho, v_meses_com_dado, v_resultado_12m
  FROM (
    SELECT to_char(data_competencia,'YYYY-MM') AS m,
      SUM(CASE WHEN tipo='receita' AND (NOT p_sem_extra OR classe_movimento='ordinaria') THEN valor
               WHEN tipo='despesa' THEN -valor ELSE 0 END) AS res
    FROM fin_transacoes
    WHERE classe_movimento IN ('ordinaria','extraordinaria') AND status<>'cancelado'
      AND data_competencia >= (date_trunc('month', CURRENT_DATE) - INTERVAL '11 months')
    GROUP BY 1
  ) sub;

  WITH doadores AS (
    SELECT LOWER(TRIM(t.referencia)) AS d, SUM(t.valor) AS total
    FROM fin_transacoes t JOIN fin_plano_contas pc ON pc.id=t.plano_contas_id
    WHERE t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND (NOT p_sem_extra OR t.classe_movimento='ordinaria')
      AND t.status<>'cancelado' AND EXTRACT(YEAR FROM t.data_competencia)=v_ano
      AND pc.codigo LIKE '3.01%' AND t.referencia IS NOT NULL AND TRIM(t.referencia)<>''
    GROUP BY 1
  ),
  ranked AS (
    SELECT total,
      ROW_NUMBER() OVER (ORDER BY total DESC) AS rn,
      SUM(total) OVER () AS geral,
      COUNT(*) OVER () AS qtd,
      GREATEST(1, FLOOR(COUNT(*) OVER () * 0.2)) AS limite_top20
    FROM doadores
  )
  SELECT
    MAX(qtd),
    ROUND(COALESCE(SUM(total) FILTER (WHERE rn <= 10) / NULLIF(MAX(geral),0) * 100, 0), 1),
    ROUND(COALESCE(SUM(total) FILTER (WHERE rn <= limite_top20) / NULLIF(MAX(geral),0) * 100, 0), 1)
  INTO v_qtd_doadores, v_top10_pct, v_top20_pct
  FROM ranked
  GROUP BY limite_top20;

  RETURN jsonb_build_object(
    'ano', v_ano, 'mes_atual', v_mes_atual,
    'receita_mes', v_receita_mes, 'despesa_mes', v_despesa_mes,
    'resultado_mes', v_receita_mes - v_despesa_mes,
    'receita_ytd', v_receita_ytd, 'despesa_ytd', v_despesa_ytd,
    'resultado_ytd', v_receita_ytd - v_despesa_ytd,
    'resultado_12m', v_resultado_12m,
    'folha_ytd', v_folha_ytd,
    'pct_folha', ROUND(COALESCE(v_folha_ytd / NULLIF(v_receita_ytd,0) * 100, 0), 1),
    'meses_vermelho', v_meses_vermelho, 'meses_com_dado', v_meses_com_dado,
    'doadores_qtd', COALESCE(v_qtd_doadores, 0),
    'concentracao_top10_pct', COALESCE(v_top10_pct, 0),
    'concentracao_top20pct_pct', COALESCE(v_top20_pct, 0)
  );
END;
$function$;

-- ── 9. RPC fin_metas_progresso · +p_sem_extra (só no ramo receita_%) ───────
DROP FUNCTION IF EXISTS public.fin_metas_progresso(date, date, uuid);
CREATE OR REPLACE FUNCTION public.fin_metas_progresso(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_meta_id uuid DEFAULT NULL::uuid, p_sem_extra boolean DEFAULT false)
 RETURNS TABLE(meta_id uuid, tipo text, periodicidade text, descricao text, valor_meta numeric, valor_atual numeric, pct numeric, periodo_inicio date, periodo_fim date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := CURRENT_DATE;
  v_semana_ini date;
  v_semana_fim date;
BEGIN
  SELECT inicio, fim INTO v_semana_ini, v_semana_fim
  FROM fin_semana_qua_ter(v_hoje);

  RETURN QUERY
  WITH metas_periodo AS (
    SELECT
      m.id, m.tipo, m.periodicidade, m.descricao,
      m.valor::numeric AS valor_meta,
      m.plano_contas_id, m.centro_custo_id, m.ano, m.mes_inicio, m.mes_fim, m.ativa,
      CASE
        WHEN p_inicio IS NOT NULL THEN p_inicio
        WHEN m.periodicidade = 'semanal' THEN v_semana_ini
        WHEN m.periodicidade = 'mensal'  THEN date_trunc('month', v_hoje)::date
        WHEN m.periodicidade = 'anual'   THEN make_date(COALESCE(m.ano, EXTRACT(YEAR FROM v_hoje)::int), 1, 1)
        ELSE date_trunc('month', v_hoje)::date
      END AS p_ini,
      CASE
        WHEN p_fim IS NOT NULL THEN p_fim
        WHEN m.periodicidade = 'semanal' THEN v_semana_fim
        WHEN m.periodicidade = 'mensal'  THEN (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date
        WHEN m.periodicidade = 'anual'   THEN make_date(COALESCE(m.ano, EXTRACT(YEAR FROM v_hoje)::int), 12, 31)
        ELSE (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date
      END AS p_end
    FROM fin_metas m
    WHERE m.ativa = true
      AND (p_meta_id IS NULL OR m.id = p_meta_id)
  ),
  agg AS (
    SELECT
      mp.id,
      CASE
        WHEN mp.tipo LIKE 'receita_%' THEN
          COALESCE(SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') AND (NOT p_sem_extra OR t.classe_movimento='ordinaria') THEN t.valor ELSE 0 END), 0)
        WHEN mp.tipo LIKE 'despesa_%' THEN
          COALESCE(SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END), 0)
        WHEN mp.tipo = 'saldo_minimo' THEN
          COALESCE(SUM(CASE WHEN t.tipo='receita' AND (NOT p_sem_extra OR t.classe_movimento='ordinaria') THEN t.valor WHEN t.tipo='despesa' THEN -t.valor ELSE 0 END), 0)
        WHEN mp.tipo = 'meta_centro_custo' THEN
          COALESCE(SUM(t.valor) FILTER (WHERE t.centro_custo_id = mp.centro_custo_id), 0)
        ELSE 0
      END AS atual
    FROM metas_periodo mp
    LEFT JOIN fin_transacoes t
      ON t.data_competencia BETWEEN mp.p_ini AND mp.p_end
      AND t.status != 'cancelado'
      AND (mp.plano_contas_id IS NULL OR t.plano_contas_id = mp.plano_contas_id)
    GROUP BY mp.id, mp.tipo, mp.centro_custo_id
  )
  SELECT
    mp.id, mp.tipo, mp.periodicidade, mp.descricao, mp.valor_meta, a.atual,
    CASE WHEN mp.valor_meta > 0 THEN (a.atual / mp.valor_meta) * 100 ELSE 0 END,
    mp.p_ini, mp.p_end
  FROM metas_periodo mp
  JOIN agg a ON a.id = mp.id
  ORDER BY mp.periodicidade, mp.tipo, mp.descricao;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_saude_financeira(integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_metas_progresso(date, date, uuid, boolean) TO authenticated, service_role;
