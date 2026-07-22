-- vw_kpi_trajetoria_atual: para KPIs SEMANAIS, "último valor" = último período
-- CONCLUÍDO (exclui a semana em curso, que ainda não teve culto), incluindo zeros
-- reais — antes pegava a última semana com valor > 0, mostrando dado velho (ex.:
-- conversões esporádicas mostravam a semana 24 em vez do 0 real da semana 29).
-- Mensal/semestral MANTÊM o filtro > 0 (o mês corrente acumula dado real, ex.:
-- Produção; excluí-lo mostraria 0 falso). Decisão do Matheus 2026-07-22.
-- (Conteúdo idêntico ao aplicado em produção via MCP na mesma data.)
CREATE OR REPLACE VIEW public.vw_kpi_trajetoria_atual AS
 WITH ultimo_manual AS (
         SELECT DISTINCT ON (r.indicador_id) r.indicador_id, r.periodo_referencia, r.valor_realizado, r.data_preenchimento
           FROM kpi_registros r
             JOIN kpi_indicadores_taticos ktm ON ktm.id = r.indicador_id
          WHERE r.valor_realizado IS NOT NULL
            AND CASE WHEN ktm.periodicidade = 'semanal'::text
                     THEN r.periodo_referencia < to_char(CURRENT_DATE, 'IYYY"-W"IW'::text)
                     ELSE r.valor_realizado > 0::numeric END
          ORDER BY r.indicador_id, r.periodo_referencia DESC
        ), ultimo_calculado AS (
         SELECT DISTINCT ON (c.kpi_id) c.kpi_id, c.periodo_referencia, c.valor_calculado, c.calculado_em
           FROM kpi_valores_calculados c
             JOIN kpi_indicadores_taticos ktc ON ktc.id = c.kpi_id
          WHERE c.valor_calculado IS NOT NULL
            AND CASE WHEN ktc.periodicidade = 'semanal'::text
                     THEN c.periodo_referencia < to_char(CURRENT_DATE, 'IYYY"-W"IW'::text)
                     ELSE c.valor_calculado > 0::numeric END
          ORDER BY c.kpi_id, c.periodo_referencia DESC
        ), meta_efetiva AS (
         SELECT k_1.id AS kpi_id,
            COALESCE(k_1.meta_valor_absoluto, t_1.meta_valor, k_1.meta_valor) AS meta_anual,
                CASE k_1.periodicidade WHEN 'semanal'::text THEN 52 WHEN 'mensal'::text THEN 12
                    WHEN 'trimestral'::text THEN 4 WHEN 'semestral'::text THEN 2 ELSE 1 END AS divisor
           FROM kpi_indicadores_taticos k_1
             LEFT JOIN kpi_trajetoria t_1 ON t_1.kpi_id = k_1.id AND t_1.ativa = true
        )
 SELECT k.id AS kpi_id, k.indicador, k.area, k.periodicidade, k.tipo_calculo, k.valores, k.is_okr, k.objetivo_geral_id,
    t.periodo_referencia AS checkpoint_periodo, t.meta_valor AS checkpoint_meta, me.meta_anual AS meta_efetiva,
        CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN round(me.meta_anual / me.divisor::numeric, 2) ELSE me.meta_anual END AS meta_periodo,
        CASE WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN uc.periodo_referencia ELSE um.periodo_referencia END AS ultimo_periodo,
        CASE WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN uc.valor_calculado ELSE um.valor_realizado END AS ultimo_valor,
        CASE
            WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN
              CASE WHEN me.meta_anual IS NULL OR me.meta_anual = 0::numeric THEN CASE WHEN uc.valor_calculado > 0::numeric THEN 'verde'::text ELSE 'vermelho'::text END
                WHEN uc.valor_calculado >= CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END THEN 'verde'::text
                WHEN uc.valor_calculado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END * 0.9) THEN 'amarelo'::text ELSE 'vermelho'::text END
            WHEN um.valor_realizado IS NOT NULL THEN
              CASE WHEN me.meta_anual IS NULL OR me.meta_anual = 0::numeric THEN CASE WHEN um.valor_realizado > 0::numeric THEN 'verde'::text ELSE 'vermelho'::text END
                WHEN um.valor_realizado >= CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END THEN 'verde'::text
                WHEN um.valor_realizado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END * 0.9) THEN 'amarelo'::text ELSE 'vermelho'::text END
            ELSE 'pendente'::text END AS status,
        CASE
            WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN
              CASE WHEN me.meta_anual IS NULL OR me.meta_anual = 0::numeric THEN 'sem_meta'::text
                WHEN uc.valor_calculado >= CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END THEN 'no_alvo'::text
                WHEN uc.valor_calculado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END * 0.9) THEN 'atras'::text ELSE 'critico'::text END
            WHEN um.valor_realizado IS NOT NULL THEN
              CASE WHEN me.meta_anual IS NULL OR me.meta_anual = 0::numeric THEN 'sem_meta'::text
                WHEN um.valor_realizado >= CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END THEN 'no_alvo'::text
                WHEN um.valor_realizado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END * 0.9) THEN 'atras'::text ELSE 'critico'::text END
            ELSE 'sem_dado'::text END AS status_trajetoria,
        CASE WHEN me.meta_anual IS NULL OR me.meta_anual = 0::numeric THEN NULL::numeric
            WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN round(uc.valor_calculado / CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END * 100::numeric, 1)
            WHEN um.valor_realizado IS NOT NULL THEN round(um.valor_realizado / CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric ELSE me.meta_anual END * 100::numeric, 1)
            ELSE NULL::numeric END AS percentual_meta
   FROM kpi_indicadores_taticos k
     LEFT JOIN kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
     LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
     LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
     LEFT JOIN meta_efetiva me ON me.kpi_id = k.id
  WHERE k.ativo = true;
