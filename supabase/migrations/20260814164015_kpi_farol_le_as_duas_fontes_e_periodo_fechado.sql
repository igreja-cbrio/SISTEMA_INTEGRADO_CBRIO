-- ⚠️ JA APLICADA EM PRODUCAO em 14/08/2026 (via MCP · version 20260814164015).
-- ⚠️ SUPERADA pela 20260814164154 (kpi_sentido_da_meta_menor_e_melhor), que
--    recria a MESMA view acrescentando o sentido da meta. Aplicar as duas na
--    ordem, ou so a segunda — nunca esta sozinha depois daquela.
--
-- O farol passa a ler as DUAS fontes, aceitar zero e julgar o periodo FECHADO
--
-- vw_kpi_taticos_status e a view mestra do painel. Medicao de 14/08/2026:
-- de 168 KPIs ativos, apenas 11 tinham farol refletindo o periodo fechado.
-- Tres defeitos, todos confirmados no codigo-fonte da view antes de mexer:
--
-- 1. WHERE r.valor_realizado > 0
--    Zero LEGITIMO nunca chegava ao farol. Medido: 1.013 de 2.439 registros
--    (41,5%) tem valor 0. Efeito real: SED-NEXT90 mediu 0 em 2026-07 e o painel
--    exibia 2 / 2025-12 — valor positivo VELHO no lugar do zero recente, que e
--    a pior forma de errar (parece dado, e e dado de outro periodo).
--
-- 2. Lia SO kpi_registros, nunca kpi_valores_calculados
--    145 dos 168 KPIs tem linha na tabela ignorada; 86 com valor. Foi isso que
--    manteve FIN-02, FIN-03 e RH-03 como "pendente" DEPOIS de a migration
--    kpi_fontes_nativas_rh_fin_nps liga-los: o dado existia e o painel nao via.
--    Consertar alimentacao sem consertar esta view deixa o trabalho invisivel.
--
-- 3. periodo_referencia <= periodo_atual
--    Aceitava o periodo EM ABERTO como se fosse fechado. 17 dos 28 farois
--    acesos vinham de periodo em curso — MKT-THROUGHPUT aparecia VERDE com o
--    numero da semana corrente enquanto a semana fechada registrou 0.
--
-- COMO A ESCOLHA DE FONTE E FEITA: a MESMA regra de vw_okr_score_composto e
-- vw_kpi_trajetoria_atual — o tipo_calculo do proprio KPI decide qual tabela e
-- autoritativa (nao-manual prefere o calculado; manual usa o registro). Farol e
-- score discordarem sobre o valor de um KPI e a origem de metade das duvidas.
--
-- NADA DE INFORMACAO SE PERDE: o valor do periodo EM CURSO continua exposto,
-- agora em colunas proprias (periodo_em_curso / valor_em_curso), no FINAL da
-- view. Quem quiser o numero ao vivo tem; o farol julga o fechado.
--
-- meta_efetiva passa a ser a meta DO PERIODO (era a anual crua). Afeta so os 10
-- KPIs que ainda tem meta_valor_absoluto (contagem de culto) — justamente os
-- que exibiam "1.228 contra 106.022". Nos outros 158 o valor nao muda.
--
-- Efeito medido: farol refletindo periodo fechado 11 -> 112 de 168; acesos
-- 28 -> 112, nenhum vindo de periodo em aberto.
--
-- ⚠️ Colunas NOVAS vao no FINAL, as antigas ficam com o mesmo nome e ordem —
-- consumidor que faz select por nome nao quebra. Conferido: backend/routes/
-- kpisV2.js e src/pages/MinhaArea.jsx usam so ultimo_valor e ultimo_periodo.

CREATE OR REPLACE VIEW public.vw_kpi_taticos_status AS
 WITH periodo_atual AS (
         SELECT 'semanal'::text AS periodicidade, to_char(now(), 'IYYY"-W"IW'::text) AS periodo
        UNION ALL SELECT 'mensal'::text, to_char(now(), 'YYYY-MM'::text)
        UNION ALL SELECT 'trimestral'::text, (to_char(now(), 'YYYY'::text) || '-Q'::text) || to_char(now(), 'Q'::text)
        UNION ALL SELECT 'semestral'::text, (to_char(now(), 'YYYY'::text) || '-S'::text) ||
                CASE WHEN EXTRACT(month FROM now()) <= 6::numeric THEN '1'::text ELSE '2'::text END
        UNION ALL SELECT 'anual'::text, to_char(now(), 'YYYY'::text)
        ),
      -- Uniao das DUAS fontes. Periodo ordena lexicograficamente DENTRO da
      -- mesma periodicidade, entao "< periodo_atual" = ultimo periodo FECHADO.
      valores AS (
         SELECT r.indicador_id AS kpi_id, r.periodo_referencia, r.valor_realizado AS valor,
                r.data_preenchimento AS quando, r.responsavel, r.origem, 'registro'::text AS fonte
           FROM kpi_registros r
          WHERE r.valor_realizado IS NOT NULL
        UNION ALL
         SELECT c.kpi_id, c.periodo_referencia, c.valor_calculado,
                c.calculado_em, 'sistema'::text, 'calculado'::text, 'calculado'::text
           FROM kpi_valores_calculados c
          WHERE c.valor_calculado IS NOT NULL
        ),
      -- tipo_calculo do KPI decide a fonte autoritativa (regra unica da casa)
      valores_efetivos AS (
         SELECT v.*, k.periodicidade
           FROM valores v
           JOIN kpi_indicadores_taticos k ON k.id = v.kpi_id
          WHERE (k.tipo_calculo IS DISTINCT FROM 'manual' AND v.fonte = 'calculado')
             OR (k.tipo_calculo IS NOT DISTINCT FROM 'manual' AND v.fonte = 'registro')
             OR NOT EXISTS (
                  SELECT 1 FROM valores v2 WHERE v2.kpi_id = v.kpi_id
                    AND v2.periodo_referencia = v.periodo_referencia AND v2.fonte <> v.fonte)
        ),
      ultimo_fechado AS (
         SELECT DISTINCT ON (v.kpi_id) v.kpi_id, v.periodo_referencia, v.valor, v.quando, v.responsavel, v.origem
           FROM valores_efetivos v
           JOIN periodo_atual pa_1 ON pa_1.periodicidade = v.periodicidade
          WHERE v.periodo_referencia < pa_1.periodo
          ORDER BY v.kpi_id, v.periodo_referencia DESC, v.fonte
        ),
      em_curso AS (
         SELECT DISTINCT ON (v.kpi_id) v.kpi_id, v.periodo_referencia, v.valor
           FROM valores_efetivos v
           JOIN periodo_atual pa_1 ON pa_1.periodicidade = v.periodicidade
          WHERE v.periodo_referencia = pa_1.periodo
          ORDER BY v.kpi_id, v.fonte
        ),
      metas AS (
         SELECT t.id,
            CASE WHEN t.meta_valor_absoluto IS NOT NULL
                 THEN round(t.meta_valor_absoluto / CASE t.periodicidade
                        WHEN 'semanal' THEN 52 WHEN 'mensal' THEN 12
                        WHEN 'trimestral' THEN 4 WHEN 'semestral' THEN 2 ELSE 1 END::numeric, 2)
                 ELSE t.meta_valor END AS meta_periodo
           FROM kpi_indicadores_taticos t
        )
 SELECT t.id, t.kpi_estrategico_id, t.area, t.indicador, t.descricao, t.periodicidade,
    t.periodo_offset_meses, t.meta_descricao, t.meta_valor, t.meta_valor_absoluto, t.unidade,
    t.responsavel_area, t.apuracao, t.sort_order, t.fonte_auto, t.valores, t.pilar, t.is_okr,
    t.ativo, t.lider_funcionario_id,
    f.nome AS lider_nome, f.cargo AS lider_cargo,
    pa.periodo AS periodo_atual,
    uf.periodo_referencia AS ultimo_periodo,
    uf.valor AS ultimo_valor,
    uf.quando AS ultima_data,
    uf.responsavel AS ultimo_responsavel,
    uf.origem AS ultima_origem,
    m.meta_periodo AS meta_efetiva,
    m.meta_periodo,
        CASE
            WHEN uf.valor IS NULL THEN 'pendente'::text
            WHEN m.meta_periodo IS NULL OR m.meta_periodo = 0::numeric THEN
                CASE WHEN uf.valor > 0::numeric THEN 'verde'::text ELSE 'vermelho'::text END
            WHEN uf.valor >= m.meta_periodo THEN 'verde'::text
            WHEN uf.valor >= (m.meta_periodo * 0.9) THEN 'amarelo'::text
            ELSE 'vermelho'::text
        END AS status,
    -- COLUNAS NOVAS (no final · o valor ao vivo, que o farol NAO julga)
    ec.periodo_referencia AS periodo_em_curso,
    ec.valor AS valor_em_curso
   FROM kpi_indicadores_taticos t
     LEFT JOIN rh_funcionarios f ON f.id = t.lider_funcionario_id
     LEFT JOIN ultimo_fechado uf ON uf.kpi_id = t.id
     LEFT JOIN em_curso ec ON ec.kpi_id = t.id
     LEFT JOIN metas m ON m.id = t.id
     LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
  WHERE t.ativo = true;

COMMENT ON VIEW public.vw_kpi_taticos_status IS
'Farol dos KPIs taticos. Le kpi_registros E kpi_valores_calculados (tipo_calculo do KPI decide a autoritativa, mesma regra de vw_okr_score_composto), aceita valor ZERO como medicao, e julga SO o periodo FECHADO (periodo_referencia < periodo corrente). '
'O valor do periodo em aberto fica em periodo_em_curso/valor_em_curso — informativo, nunca no farol. '
'meta_efetiva e a meta DO PERIODO (meta_valor_absoluto ja dividida pela periodicidade). '
'Corrigida em 14/08/2026 (migration kpi_farol_le_as_duas_fontes_e_periodo_fechado): antes filtrava valor>0, ignorava kpi_valores_calculados e aceitava periodo em curso — 17 de 28 farois acesos vinham de periodo aberto.';
