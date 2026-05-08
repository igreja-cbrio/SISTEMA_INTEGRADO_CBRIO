-- ============================================================================
-- KPI · AGREGACAO DIRETA DA FONTE (sem snapshot, sem cron)
--
-- Marcos: "kpi e um ou mais dados concretos trabalhados, ex: frequencia mensal
-- = soma de todos os dados de frequencia em um mes. Coloque uma funcao que
-- calcule isso automaticamente, isso nao resolveria pra todos?"
--
-- Resposta: sim. Reescreve _kpi_agregar_dado() para ler DIRETO da tabela-fonte
-- (cultos, mem_voluntarios, mem_contribuicoes, etc) ao inves de exigir
-- preenchimento em dados_brutos. Fallback para dados_brutos quando o tipo
-- nao tem fonte natural (NPS, lideres acompanhados, solicitacoes ate criar
-- modulos respectivos).
--
-- Vantagens vs snapshot/cron:
--   · sempre fresco (le cultos.presencial_adulto agora-mesmo)
--   · zero estado intermediario
--   · uma funcao, dispatch por tipo
--   · KPIs com tipo_calculo delta_pct/razao/etc continuam funcionando · so muda
--     de onde vem o numero
-- ============================================================================

CREATE OR REPLACE FUNCTION public._kpi_agregar_dado(
  p_dado_tipo text,
  p_area text,
  p_data_inicio date,
  p_data_fim date
) RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_agregacao text;
  v_resultado numeric;
  v_area_lower text := lower(coalesce(p_area, ''));
BEGIN
  -- ──────────────────────────────────────────────────────────────────────
  -- DISPATCH POR TIPO · le da fonte natural quando existe
  -- ──────────────────────────────────────────────────────────────────────

  -- FREQUENCIA CULTO · cultos.presencial_adulto/kids
  IF p_dado_tipo = 'frequencia_culto' THEN
    IF v_area_lower = 'kids' THEN
      -- Kids: soma presencial_kids em todos os cultos do periodo
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
      -- Sede: cultos que NAO sao AMI/Bridge/Online
      SELECT coalesce(sum(presencial_adulto), 0) INTO v_resultado
        FROM public.cultos
       WHERE data >= p_data_inicio AND data <= p_data_fim
         AND lower(nome) NOT LIKE '%ami%' AND lower(nome) NOT LIKE '%sabado%'
         AND lower(nome) NOT LIKE '%sábado%' AND lower(nome) NOT LIKE '%bridge%'
         AND lower(nome) NOT LIKE '%online%';
    ELSE
      v_resultado := NULL;  -- online/cba nao tem fonte direta · fallback abaixo
    END IF;
    IF v_resultado IS NOT NULL THEN RETURN v_resultado; END IF;

  -- CONVERSOES · cultos.decisoes_presenciais + decisoes_online
  ELSIF p_dado_tipo = 'conversoes' THEN
    IF v_area_lower = 'kids' THEN
      -- Kids: assume todas decisoes em cultos onde tem kids
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
      -- Online: total de decisoes_online em todos os cultos
      SELECT coalesce(sum(decisoes_online), 0) INTO v_resultado
        FROM public.cultos
       WHERE data >= p_data_inicio AND data <= p_data_fim;
    ELSE
      v_resultado := NULL;
    END IF;
    IF v_resultado IS NOT NULL THEN RETURN v_resultado; END IF;

  -- BATISMOS · batismo_inscricoes status=realizado
  ELSIF p_dado_tipo = 'batismos' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='batismo_inscricoes') THEN
      EXECUTE 'SELECT count(*) FROM public.batismo_inscricoes WHERE status = ''realizado'' AND data_realizacao >= $1 AND data_realizacao <= $2'
        INTO v_resultado USING p_data_inicio, p_data_fim;
      RETURN v_resultado;
    END IF;

  -- VOLUNTARIOS ATIVOS · mem_voluntarios servindo no periodo
  ELSIF p_dado_tipo = 'voluntarios_ativos' THEN
    SELECT count(DISTINCT id) INTO v_resultado
      FROM public.mem_voluntarios
     WHERE de <= p_data_fim
       AND (ate IS NULL OR ate >= p_data_inicio);
    RETURN v_resultado;

  -- VOLUNTARIOS INATIVOS > 3 MESES
  ELSIF p_dado_tipo = 'voluntarios_inativos_3m' THEN
    SELECT count(DISTINCT id) INTO v_resultado
      FROM public.mem_voluntarios
     WHERE ate IS NOT NULL
       AND ate < (p_data_fim - interval '3 months')::date
       AND ate >= (p_data_fim - interval '12 months')::date;
    RETURN v_resultado;

  -- VOLUNTARIOS RECUPERADOS · saiu antes mas voltou no periodo
  ELSIF p_dado_tipo = 'voluntarios_recuperados' THEN
    -- Aproximacao: count distinct membro_id com >=2 periodos (saiu e voltou)
    -- Heuristica simples · pode precisar ajuste conforme model real
    SELECT count(DISTINCT membro_id) INTO v_resultado
      FROM public.mem_voluntarios v1
     WHERE v1.de >= p_data_inicio
       AND v1.de <= p_data_fim
       AND EXISTS (
         SELECT 1 FROM public.mem_voluntarios v2
          WHERE v2.membro_id = v1.membro_id
            AND v2.ate IS NOT NULL
            AND v2.ate < v1.de
       );
    RETURN v_resultado;

  -- DOACOES VALOR · sum mem_contribuicoes.valor
  ELSIF p_dado_tipo = 'doacoes_valor' THEN
    SELECT coalesce(sum(valor), 0) INTO v_resultado
      FROM public.mem_contribuicoes
     WHERE data >= p_data_inicio AND data <= p_data_fim;
    RETURN v_resultado;

  -- DOADORES UNICOS · count distinct membro_id
  ELSIF p_dado_tipo = 'doadores_count' THEN
    SELECT count(DISTINCT membro_id) INTO v_resultado
      FROM public.mem_contribuicoes
     WHERE data >= p_data_inicio AND data <= p_data_fim;
    RETURN v_resultado;

  -- DOADORES RECORRENTES · doaram em >=3 meses dentro do periodo
  ELSIF p_dado_tipo = 'doadores_recorrentes' THEN
    SELECT count(*) INTO v_resultado FROM (
      SELECT membro_id
        FROM public.mem_contribuicoes
       WHERE data >= p_data_inicio AND data <= p_data_fim
       GROUP BY membro_id
      HAVING count(DISTINCT date_trunc('month', data)) >= 3
    ) t;
    RETURN v_resultado;

  -- FREQUENCIA GRUPOS · membros ativos no periodo
  ELSIF p_dado_tipo = 'frequencia_grupos' THEN
    SELECT count(DISTINCT membro_id) INTO v_resultado
      FROM public.mem_grupo_membros
     WHERE entrou_em <= p_data_fim
       AND (saiu_em IS NULL OR saiu_em >= p_data_inicio);
    RETURN v_resultado;

  -- GRUPOS ATIVOS · count
  ELSIF p_dado_tipo = 'grupos_ativos' THEN
    SELECT count(*) INTO v_resultado
      FROM public.mem_grupos
     WHERE coalesce(ativo, true) = true;
    RETURN v_resultado;

  -- LIDERES DE GRUPOS · count distinct lider
  ELSIF p_dado_tipo = 'lideres_grupos' THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mem_grupo_membros' AND column_name='papel') THEN
      EXECUTE 'SELECT count(DISTINCT membro_id) FROM public.mem_grupo_membros WHERE lower(papel) IN (''lider'',''co-lider'',''colider'') AND (saiu_em IS NULL OR saiu_em >= $1)'
        INTO v_resultado USING p_data_inicio;
      RETURN v_resultado;
    END IF;

  -- DEVOCIONAIS · count mem_devocionais (se tabela existe)
  ELSIF p_dado_tipo = 'devocionais' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mem_devocionais') THEN
      EXECUTE 'SELECT count(*) FROM public.mem_devocionais WHERE data >= $1 AND data <= $2'
        INTO v_resultado USING p_data_inicio, p_data_fim;
      RETURN v_resultado;
    END IF;

  -- INSCRICOES JORNADA 180
  ELSIF p_dado_tipo = 'inscricoes_jornada180' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_jornada180') THEN
      EXECUTE 'SELECT count(*) FROM public.cui_jornada180 WHERE data_encontro >= $1 AND data_encontro <= $2'
        INTO v_resultado USING p_data_inicio, p_data_fim;
      RETURN v_resultado;
    END IF;

  -- NOVOS CONVERTIDOS ATENDIDOS POS-CULTO
  ELSIF p_dado_tipo = 'novos_convertidos_atend' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_convertidos') THEN
      EXECUTE 'SELECT count(*) FROM public.cui_convertidos WHERE atendido_apos_culto = true AND data_culto >= $1 AND data_culto <= $2'
        INTO v_resultado USING p_data_inicio, p_data_fim;
      RETURN v_resultado;
    END IF;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- FALLBACK · le de dados_brutos (preenchimento manual via /dados-brutos)
  -- Cobre: NPS, lideres_treinados/acompanhados, solicitacoes_*, voluntarios_treinamento,
  -- voluntarios_checkin, frequencia_next, e qualquer outro tipo sem fonte natural.
  -- ──────────────────────────────────────────────────────────────────────
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
$$;

GRANT EXECUTE ON FUNCTION public._kpi_agregar_dado(text, text, date, date) TO authenticated, service_role;

-- ============================================================================
-- TIPOS QUE PERMANECEM MANUAIS (sem fonte natural · ate criar modulos)
--
--   - voluntarios_treinamento  (modulo Treinamento futuro)
--   - voluntarios_checkin      (precisa Planning Center · futuro)
--   - voluntarios_alocados     (modulo Solicitacoes futuro)
--   - lideres_treinados        (modulo Treinamento futuro)
--   - lideres_acompanhados     (registro estruturado nao existe ainda)
--   - solicitacoes_*           (modulo Solicitacoes futuro)
--   - nps_*                    (modulo NPS futuro)
--   - frequencia_next          (modulo NEXT futuro)
--   - doacoes_qualidade        (regras complexas Grupo C->B · futuro)
--
-- Para esses tipos, lider continua preenchendo em /dados-brutos manualmente.
-- O fallback acima le de dados_brutos sem mudanca alguma.
-- ============================================================================

-- ============================================================================
-- FORCAR RECALCULO · agora que a funcao le da fonte, vale recalcular tudo
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  v_total int := 0;
BEGIN
  FOR r IN
    SELECT id, periodicidade FROM public.kpi_indicadores_taticos
     WHERE ativo = true AND tipo_calculo != 'manual'
  LOOP
    PERFORM public.recalcular_kpi(r.id, NULL);
    v_total := v_total + 1;
  END LOOP;
  RAISE NOTICE 'Recalculados % KPIs com a nova logica de fonte direta', v_total;
END $$;

-- ============================================================================
-- Conferencia (descomenta no Studio)
-- ============================================================================
-- SELECT k.id, k.indicador, k.area, k.tipo_calculo, t.ultimo_valor, t.ultimo_periodo
--   FROM kpi_indicadores_taticos k
--   LEFT JOIN vw_kpi_trajetoria_atual t ON t.kpi_id = k.id
--  WHERE k.ativo = true AND k.tipo_calculo != 'manual'
--  ORDER BY k.area, k.id;
