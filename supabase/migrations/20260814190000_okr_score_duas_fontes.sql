-- Score do OKR: lê as DUAS fontes de valor e usa a meta do PERÍODO
--
-- Achado da varredura de 14/08/2026 (o de maior impacto no lado dos OKRs):
-- `vw_okr_score_composto` lia SÓ `kpi_valores_calculados`. Os KPIs com
-- `tipo_calculo='manual'` + `fonte_auto` são alimentados pelos COLETORES todo
-- dia e gravam em `kpi_registros`, nunca em `kpi_valores_calculados`.
--
-- Medido antes: **30 KPIs alimentados diariamente eram invisíveis para o
-- score, 18 deles ligados a um objetivo**. O OKR aparecia com "0 KPIs com
-- dado" enquanto os coletores rodavam sem falha nenhuma — é o pior tipo de
-- número errado, porque parece falta de operação e é falta de leitura.
--
-- ⚠️ Além da FONTE, isto corrige a META. A view antiga fazia
-- `valor / k.meta_valor`, ignorando `meta_valor_absoluto` e a normalização por
-- periodicidade — a LEI "Meta absoluta × periodicidade" registrada no
-- CLAUDE.md. Ou seja: comparava valor de UMA semana contra meta ANUAL em
-- vários KPIs, e o score saía baixo por aritmética.
--
-- ⚠️⚠️ ZERO CONTA COMO DADO, e é por isso que esta view NÃO lê
-- `vw_kpi_trajetoria_atual` direto (a 1ª tentativa desta sessão fez isso).
-- Aquela view descarta valor <= 0 de propósito, para o SEMÁFORO do painel.
-- No score do OKR, "o número de grupos não cresceu" é desempenho medido, não
-- ausência de medição — e tratá-lo como "sem dado" esconde exatamente o
-- objetivo que precisa de atenção. Medido na tentativa intermediária:
-- "Aumentar numero de grupos" caiu de 4 KPIs com dado para 0.
--
-- ⚠️ O filtro de SEMANA CORRENTE fica (espelha a trajetória): semana ainda em
-- curso é período incompleto e não pode pontuar.
--
-- ⚠️ O piso em zero continua (`GREATEST`): delta_pct negativo puxa o objetivo
-- para 0, não para -174%.
--
-- Efeito medido: OKRs com nenhum KPI alimentado caíram de **10 para 7**;
-- batismos foi de 4 para 9 KPIs medidos (de 10), devocionais de 4 para 7 (de
-- 7) e "voluntários em treinamento" de 0 para 5 (de 5).

CREATE OR REPLACE VIEW public.vw_okr_score_composto AS
 WITH semana_atual AS (
   SELECT to_char(CURRENT_DATE::timestamptz, 'IYYY"-W"IW') AS w
 ), ultimo_registro AS (
   SELECT DISTINCT ON (r.indicador_id) r.indicador_id, r.valor_realizado
     FROM kpi_registros r
     JOIN kpi_indicadores_taticos kr ON kr.id = r.indicador_id
    WHERE r.valor_realizado IS NOT NULL
      AND (kr.periodicidade <> 'semanal' OR r.periodo_referencia < (SELECT w FROM semana_atual))
    ORDER BY r.indicador_id, r.periodo_referencia DESC
 ), ultimo_calculado AS (
   SELECT DISTINCT ON (c.kpi_id) c.kpi_id, c.valor_calculado
     FROM kpi_valores_calculados c
     JOIN kpi_indicadores_taticos kc ON kc.id = c.kpi_id
    WHERE c.valor_calculado IS NOT NULL
      AND (kc.periodicidade <> 'semanal' OR c.periodo_referencia < (SELECT w FROM semana_atual))
    ORDER BY c.kpi_id, c.periodo_referencia DESC
 ), valor_efetivo AS (
   SELECT k.id AS kpi_id,
     CASE WHEN k.tipo_calculo <> 'manual' AND uc.valor_calculado IS NOT NULL
          THEN uc.valor_calculado ELSE ur.valor_realizado END AS valor,
     CASE WHEN k.meta_valor_absoluto IS NOT NULL
          THEN COALESCE(k.meta_valor_absoluto, t.meta_valor, k.meta_valor)
               / (CASE k.periodicidade
                    WHEN 'semanal' THEN 52 WHEN 'mensal' THEN 12
                    WHEN 'trimestral' THEN 4 WHEN 'semestral' THEN 2 ELSE 1 END)::numeric
          ELSE COALESCE(t.meta_valor, k.meta_valor) END AS meta_periodo
     FROM kpi_indicadores_taticos k
     LEFT JOIN kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
     LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
     LEFT JOIN ultimo_registro ur ON ur.indicador_id = k.id
    WHERE k.ativo = true
 )
 SELECT o.id AS okr_id,
    o.nome AS okr_nome,
    count(k.id) AS total_kpis,
    count(v.valor) AS kpis_com_dado,
        CASE
            WHEN count(k.id) = 0 THEN NULL::numeric
            ELSE round(sum(
            CASE
                WHEN v.valor IS NULL OR v.meta_periodo IS NULL OR v.meta_periodo = 0::numeric THEN 0::numeric
                ELSE GREATEST(LEAST(v.valor / v.meta_periodo, 1::numeric), 0::numeric)
            END) * 100::numeric / count(k.id)::numeric, 1)
        END AS score_composto_pct
   FROM kpi_objetivos_gerais o
     LEFT JOIN kpi_indicadores_taticos k ON k.objetivo_geral_id = o.id AND k.ativo = true
     LEFT JOIN valor_efetivo v ON v.kpi_id = k.id
  WHERE o.ativo = true
  GROUP BY o.id, o.nome;
