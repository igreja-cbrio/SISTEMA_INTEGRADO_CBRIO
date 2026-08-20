-- KPIs de doação: fonte correta + score de OKR com piso em zero
--
-- Achados da varredura de 14/08/2026:
--
-- 1) Os 15 KPIs de doação por área (AMI-07/23/24, BRG-06/22/23, KIDS-06/21/22,
--    ONL-22/23/24, SED-01/24/25) nunca calcularam nada. _kpi_agregar_dado filtra
--    mem_contribuicoes por `area`, mas essa coluna e NULL nas 20.196 linhas da
--    tabela — doação na CBRio não e segmentada por área. O filtro zerava tudo
--    antes mesmo de olhar o valor.
--
-- 2) `doacoes_valor` lia mem_contribuicoes, que parou em 16/06/2026 (aguarda a
--    planilha nominal). O valor arrecadado ja vive atualizado em
--    vw_doacoes_unificada/fin_transacoes — mesma fonte que o coletor
--    generosidade.valor_total usa e que esta em dia (11/08/2026). Duas fontes
--    para o mesmo numero davam resultados diferentes no painel.
--
--    `doadores_count` e `doadores_recorrentes` continuam em mem_contribuicoes:
--    contam PESSOAS distintas e fin_transacoes tem membro_id NULL em 100% das
--    linhas. Voltam a andar sozinhos quando a base nominal for atualizada.
--
-- 3) vw_okr_score_composto somava delta_pct negativo sem piso, produzindo score
--    de -174%. Tinha LEAST(x, 1) mas faltava o GREATEST(x, 0).

CREATE OR REPLACE FUNCTION public._kpi_agregar_dado(p_dado_tipo text, p_area text, p_data_inicio date, p_data_fim date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE
    v_agregacao text;
    v_resultado numeric;
    v_area_lower text := lower(coalesce(p_area, ''));
    v_filtra_area boolean := lower(coalesce(p_area, '')) IN ('kids', 'sede', 'ami', 'bridge', 'online');
  BEGIN
    -- FREQUENCIA CULTO · cultos.presencial_adulto/kids (segmenta pelo nome)
    IF p_dado_tipo = 'frequencia_culto' THEN
      IF v_area_lower = 'kids' THEN
        SELECT coalesce(sum(presencial_kids), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim;
      ELSIF v_area_lower = 'ami' THEN
        SELECT coalesce(sum(presencial_adulto), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim
           AND (lower(nome) LIKE '%ami%' OR lower(nome) LIKE '%sabado%' OR lower(nome) LIKE '%sábado%')
           AND lower(nome) NOT LIKE '%bridge%';
      ELSIF v_area_lower = 'bridge' THEN
        SELECT coalesce(sum(presencial_adulto), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim
           AND lower(nome) LIKE '%bridge%';
      ELSIF v_area_lower = 'sede' THEN
        SELECT coalesce(sum(presencial_adulto), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim
           AND lower(nome) NOT LIKE '%ami%' AND lower(nome) NOT LIKE '%sabado%'
           AND lower(nome) NOT LIKE '%sábado%' AND lower(nome) NOT LIKE '%bridge%'
           AND lower(nome) NOT LIKE '%online%';
      ELSE
        v_resultado := NULL;
      END IF;
      IF v_resultado IS NOT NULL THEN RETURN v_resultado; END IF;

    ELSIF p_dado_tipo = 'conversoes' THEN
      IF v_area_lower = 'kids' THEN
        SELECT coalesce(sum(decisoes_presenciais), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim AND presencial_kids > 0;
      ELSIF v_area_lower = 'ami' THEN
        SELECT coalesce(sum(decisoes_presenciais + coalesce(decisoes_online, 0)), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim
           AND (lower(nome) LIKE '%ami%' OR lower(nome) LIKE '%sabado%' OR lower(nome) LIKE '%sábado%')
           AND lower(nome) NOT LIKE '%bridge%';
      ELSIF v_area_lower = 'bridge' THEN
        SELECT coalesce(sum(decisoes_presenciais + coalesce(decisoes_online, 0)), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim
           AND lower(nome) LIKE '%bridge%';
      ELSIF v_area_lower = 'sede' THEN
        SELECT coalesce(sum(decisoes_presenciais + coalesce(decisoes_online, 0)), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim
           AND lower(nome) NOT LIKE '%ami%' AND lower(nome) NOT LIKE '%bridge%'
           AND lower(nome) NOT LIKE '%online%';
      ELSIF v_area_lower = 'online' THEN
        SELECT coalesce(sum(decisoes_online), 0) INTO v_resultado
          FROM public.cultos
         WHERE data >= p_data_inicio AND data <= p_data_fim;
      ELSE
        v_resultado := NULL;
      END IF;
      IF v_resultado IS NOT NULL THEN RETURN v_resultado; END IF;

    ELSIF p_dado_tipo = 'batismos' THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='batismo_inscricoes') THEN
        SELECT count(*) INTO v_resultado
          FROM public.batismo_inscricoes
         WHERE status = 'realizado'
           AND data_batismo >= p_data_inicio
           AND data_batismo <= p_data_fim
           AND (NOT v_filtra_area OR area_kpi = v_area_lower);
        RETURN v_resultado;
      END IF;

    ELSIF p_dado_tipo = 'voluntarios_ativos' THEN
      SELECT count(DISTINCT id) INTO v_resultado
        FROM public.mem_voluntarios
       WHERE desde <= p_data_fim
         AND (ate IS NULL OR ate >= p_data_inicio)
         AND (NOT v_filtra_area OR area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'voluntarios_inativos_3m' THEN
      SELECT count(DISTINCT id) INTO v_resultado
        FROM public.mem_voluntarios
       WHERE ate IS NOT NULL
         AND ate < (p_data_fim - interval '3 months')::date
         AND ate >= (p_data_fim - interval '12 months')::date
         AND (NOT v_filtra_area OR area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'voluntarios_recuperados' THEN
      SELECT count(DISTINCT v1.membro_id) INTO v_resultado
        FROM public.mem_voluntarios v1
       WHERE v1.desde >= p_data_inicio
         AND v1.desde <= p_data_fim
         AND (NOT v_filtra_area OR v1.area = v_area_lower)
         AND EXISTS (
           SELECT 1 FROM public.mem_voluntarios v2
            WHERE v2.membro_id = v1.membro_id
              AND v2.ate IS NOT NULL
              AND v2.ate < v1.desde
         );
      RETURN v_resultado;

    -- DOACOES · valor vem de vw_doacoes_unificada/fin_transacoes (mesma fonte do
    -- coletor generosidade.valor_total, atualizada). Sem filtro de área: doação
    -- na CBRio não e segmentada por área — cada área acompanha o total da igreja.
    ELSIF p_dado_tipo = 'doacoes_valor' THEN
      SELECT coalesce(sum(valor), 0) INTO v_resultado
        FROM public.vw_doacoes_unificada
       WHERE fonte = 'fin_transacoes'
         AND data >= p_data_inicio AND data <= p_data_fim;
      RETURN v_resultado;

    -- Contagem de PESSOAS continua em mem_contribuicoes: e a unica base nominal
    -- (fin_transacoes tem membro_id NULL). Sem filtro de área pelo mesmo motivo
    -- acima — mem_contribuicoes.area e NULL em 100% das linhas.
    ELSIF p_dado_tipo = 'doadores_count' THEN
      SELECT count(DISTINCT membro_id) INTO v_resultado
        FROM public.mem_contribuicoes
       WHERE data >= p_data_inicio AND data <= p_data_fim;
      RETURN v_resultado;

    -- "Recorrência >= 3 meses" precisa de JANELA, não do período: exigir 3 meses
    -- distintos DENTRO de um período mensal dava 0 por construção. Agora olha os
    -- 3 meses corridos que terminam no período de referência.
    ELSIF p_dado_tipo = 'doadores_recorrentes' THEN
      SELECT count(*) INTO v_resultado FROM (
        SELECT membro_id
          FROM public.mem_contribuicoes
         WHERE data >= (date_trunc('month', p_data_fim) - interval '2 months')::date
           AND data <= p_data_fim
         GROUP BY membro_id
        HAVING count(DISTINCT date_trunc('month', data)) >= 3
      ) t;
      RETURN v_resultado;

    -- FREQUENCIA GRUPOS · frequência REAL (presenças), não inscritos
    ELSIF p_dado_tipo = 'frequencia_grupos' THEN
      SELECT count(DISTINCT p.membro_id) INTO v_resultado
        FROM public.mem_grupo_encontro_presencas p
        JOIN public.mem_grupo_encontros e ON e.id = p.encontro_id AND e.deleted_at IS NULL
        JOIN public.mem_grupos g ON g.id = e.grupo_id
       WHERE p.presente = true
         AND e.data BETWEEN p_data_inicio AND p_data_fim
         AND (NOT v_filtra_area OR g.area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'grupos_ativos' THEN
      SELECT count(*) INTO v_resultado
        FROM public.mem_grupos
       WHERE coalesce(ativo, true) = true
         AND (NOT v_filtra_area OR area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'lideres_grupos' THEN
      SELECT count(DISTINCT lider_id) INTO v_resultado
        FROM public.mem_grupos
       WHERE coalesce(ativo, true) = true
         AND lider_id IS NOT NULL
         AND (NOT v_filtra_area OR area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'devocionais' THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mem_devocionais') THEN
        SELECT count(*) INTO v_resultado
          FROM public.mem_devocionais
         WHERE data_devocional >= p_data_inicio
           AND data_devocional <= p_data_fim;
        RETURN v_resultado;
      END IF;

    ELSIF p_dado_tipo = 'inscricoes_jornada180' THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_j180_turma_membros') THEN
        SELECT count(*) INTO v_resultado
          FROM public.cui_j180_turma_membros tm
          JOIN public.cui_j180_turmas t ON t.id = tm.turma_id AND t.deleted_at IS NULL
         WHERE (NOT v_filtra_area OR lower(t.area) = v_area_lower)
           AND tm.entrou_em >= p_data_inicio
           AND tm.entrou_em <= p_data_fim;
        RETURN v_resultado;
      ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_jornada180') THEN
        SELECT count(*) INTO v_resultado
          FROM public.cui_jornada180
         WHERE data_encontro >= p_data_inicio
           AND data_encontro <= p_data_fim;
        RETURN v_resultado;
      END IF;

    ELSIF p_dado_tipo = 'novos_convertidos_atend' THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_convertidos') THEN
        SELECT count(*) INTO v_resultado
          FROM public.cui_convertidos
         WHERE atendido_apos_culto = true
           AND data_culto >= p_data_inicio
           AND data_culto <= p_data_fim;
        RETURN v_resultado;
      END IF;

    ELSIF p_dado_tipo = 'lideres_treinados' THEN
      SELECT count(DISTINCT gm.membro_id) INTO v_resultado
        FROM public.mem_grupo_membros gm
        JOIN public.mem_grupos g ON g.id = gm.grupo_id
       WHERE gm.funcao = 'lider_treinamento'
         AND gm.deleted_at IS NULL
         AND gm.saiu_em IS NULL
         AND gm.entrou_em <= p_data_fim
         AND (NOT v_filtra_area OR g.area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'lideres_acompanhados' THEN
      SELECT count(DISTINCT g.lider_id) INTO v_resultado
        FROM public.grupo_supervisao_visitas v
        JOIN public.mem_grupos g ON g.id = v.grupo_id
       WHERE v.data_visita BETWEEN p_data_inicio AND p_data_fim
         AND g.lider_id IS NOT NULL
         AND (NOT v_filtra_area OR g.area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'voluntarios_checkin' THEN
      SELECT CASE WHEN count(s.id) = 0 THEN NULL
                  ELSE round(100.0 * count(ci.id)::numeric / count(s.id), 2) END
        INTO v_resultado
        FROM public.vol_schedules s
        JOIN public.vol_services sv ON sv.id = s.service_id
        LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id
       WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'solicitacoes_servir_recebidas' THEN
      SELECT count(*) INTO v_resultado
        FROM public.vol_inscricoes
       WHERE deleted_at IS NULL AND data_inscricao::date BETWEEN p_data_inicio AND p_data_fim
         AND (NOT v_filtra_area OR area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'solicitacoes_servir_alocadas' THEN
      SELECT count(*) INTO v_resultado
        FROM public.vol_inscricoes
       WHERE deleted_at IS NULL AND data_inscricao::date BETWEEN p_data_inicio AND p_data_fim
         AND status IN ('enviado_ministerio', 'integrado', 'kids')
         AND (NOT v_filtra_area OR area = v_area_lower);
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'solicitacoes_capelania_recebidas' THEN
      SELECT count(*) INTO v_resultado
        FROM public.cui_acompanhamentos
       WHERE deleted_at IS NULL
         AND data_inicio BETWEEN p_data_inicio AND p_data_fim
         AND motivo ILIKE '%capelania%';
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'solicitacoes_capelania' THEN
      SELECT count(*) INTO v_resultado
        FROM public.cui_acompanhamentos
       WHERE deleted_at IS NULL
         AND data_inicio BETWEEN p_data_inicio AND p_data_fim
         AND motivo ILIKE '%capelania%'
         AND responsavel_id IS NOT NULL;
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'solicitacoes_aconselhamento_recebidas' THEN
      SELECT count(*) INTO v_resultado
        FROM public.cui_acompanhamentos
       WHERE deleted_at IS NULL
         AND data_inicio BETWEEN p_data_inicio AND p_data_fim
         AND (motivo IS NULL OR motivo NOT ILIKE '%capelania%');
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'solicitacoes_aconselh' THEN
      SELECT count(*) INTO v_resultado
        FROM public.cui_acompanhamentos
       WHERE deleted_at IS NULL
         AND data_inicio BETWEEN p_data_inicio AND p_data_fim
         AND (motivo IS NULL OR motivo NOT ILIKE '%capelania%')
         AND responsavel_id IS NOT NULL;
      RETURN v_resultado;

    ELSIF p_dado_tipo = 'frequencia_next' THEN
      SELECT count(*) INTO v_resultado
        FROM public.next_presencas pr
        JOIN public.next_encontros e ON e.id = pr.encontro_id
       WHERE pr.presente = true
         AND e.data BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;
    END IF;

    -- FALLBACK · dados_brutos (preenchimento manual)
    SELECT agregacao INTO v_agregacao FROM public.tipos_dado_bruto WHERE id = p_dado_tipo;
    IF v_agregacao IS NULL THEN RETURN NULL; END IF;

    IF v_agregacao = 'sum' THEN
      SELECT sum(valor) INTO v_resultado FROM public.dados_brutos
       WHERE tipo_id = p_dado_tipo AND lower(area) = v_area_lower
         AND data BETWEEN p_data_inicio AND p_data_fim;
    ELSIF v_agregacao = 'avg' THEN
      SELECT avg(valor) INTO v_resultado FROM public.dados_brutos
       WHERE tipo_id = p_dado_tipo AND lower(area) = v_area_lower
         AND data BETWEEN p_data_inicio AND p_data_fim;
    ELSIF v_agregacao = 'count' THEN
      SELECT count(*) INTO v_resultado FROM public.dados_brutos
       WHERE tipo_id = p_dado_tipo AND lower(area) = v_area_lower
         AND data BETWEEN p_data_inicio AND p_data_fim;
    ELSIF v_agregacao = 'count_distinct' THEN
      SELECT count(DISTINCT valor) INTO v_resultado FROM public.dados_brutos
       WHERE tipo_id = p_dado_tipo AND lower(area) = v_area_lower
         AND data BETWEEN p_data_inicio AND p_data_fim;
    ELSIF v_agregacao = 'last' THEN
      SELECT valor INTO v_resultado FROM public.dados_brutos
       WHERE tipo_id = p_dado_tipo AND lower(area) = v_area_lower
         AND data BETWEEN p_data_inicio AND p_data_fim
       ORDER BY data DESC LIMIT 1;
    END IF;

    RETURN v_resultado;
  END;
  $function$;

-- Score de OKR: piso em zero. Um KPI de crescimento negativo puxa o objetivo
-- para 0, não para -174%.
CREATE OR REPLACE VIEW public.vw_okr_score_composto AS
 WITH ultimos_valores AS (
         SELECT DISTINCT ON (kpi_valores_calculados.kpi_id) kpi_valores_calculados.kpi_id,
            kpi_valores_calculados.valor_calculado,
            kpi_valores_calculados.periodo_referencia,
            kpi_valores_calculados.calculado_em
           FROM kpi_valores_calculados
          WHERE kpi_valores_calculados.valor_calculado IS NOT NULL
          ORDER BY kpi_valores_calculados.kpi_id, kpi_valores_calculados.calculado_em DESC
        )
 SELECT o.id AS okr_id,
    o.nome AS okr_nome,
    count(k.id) AS total_kpis,
    count(uv.kpi_id) AS kpis_com_dado,
        CASE
            WHEN count(k.id) = 0 THEN NULL::numeric
            ELSE round(sum(
            CASE
                WHEN uv.valor_calculado IS NULL OR k.meta_valor IS NULL OR k.meta_valor = 0::numeric THEN 0::numeric
                ELSE GREATEST(LEAST(uv.valor_calculado / k.meta_valor, 1::numeric), 0::numeric)
            END) * 100::numeric / count(k.id)::numeric, 1)
        END AS score_composto_pct
   FROM kpi_objetivos_gerais o
     LEFT JOIN kpi_indicadores_taticos k ON k.objetivo_geral_id = o.id AND k.ativo = true
     LEFT JOIN ultimos_valores uv ON uv.kpi_id = k.id
  WHERE o.ativo = true
  GROUP BY o.id, o.nome;

-- Os 5 KPIs de valor arrecadado se chamam "% Crescimento do valor total de
-- entradas em relação ao ano anterior" e têm meta 30 (%), mas estavam como
-- soma_periodo/{periodo:ano} — que devolve o somatório do ano em R$ e IGNORA o
-- período de referência (usa sempre current_date). Resultado: R$ 6,9 mi repetido
-- em todo mês do histórico, contra uma meta de 30% → score de OKR travado em
-- 100%. Passam a ser delta_pct contra o mesmo mês do ano anterior, que e o que
-- o nome e a meta dizem. Base de 2025 esta completa (R$ 9,37 mi).
UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo   = 'delta_pct',
       formula_config = '{"dado_tipo": "doacoes_valor", "comparacao": "ano_anterior"}'::jsonb,
       unidade        = '%',
       updated_at     = now()
 WHERE id IN ('AMI-24', 'BRG-23', 'KIDS-22', 'ONL-24', 'SED-25')
   AND deleted_at IS NULL;
