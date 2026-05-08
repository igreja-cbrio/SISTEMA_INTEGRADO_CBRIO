-- ============================================================================
-- AUTO-SYNC dados_brutos a partir das tabelas-fonte
--
-- Marcos confirmou em 2026-05-08: "deve ser tudo automatico". Hoje so a
-- jornada/NSM e auto-povoada. Os KPIs estrategicos (Fase 6) so calculam
-- quando alguem preenche /dados-brutos manual.
--
-- Esta migration cria funcoes que fazem snapshot das tabelas-fonte para
-- dados_brutos. O trigger existente (tg_dados_brutos_recalc) ja recalcula
-- os KPIs.
--
-- Agendamento: cron Vercel diario chama POST /api/dados-brutos/cron/snapshot
-- (ver backend/routes/dadosBrutos.js).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER: upsert_dado_bruto · respeita UNIQUE(tipo_id, area, data, contexto)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_dado_bruto(
  p_tipo_id     text,
  p_area        text,
  p_data        date,
  p_valor       numeric,
  p_contexto    text DEFAULT NULL,
  p_observacao  text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Se ja existe, atualiza valor + observacao + marca como auto
  SELECT id INTO v_id
    FROM public.dados_brutos
   WHERE tipo_id = p_tipo_id
     AND lower(area) = lower(p_area)
     AND data = p_data
     AND coalesce(contexto, '') = coalesce(p_contexto, '');

  IF v_id IS NOT NULL THEN
    UPDATE public.dados_brutos
       SET valor = p_valor,
           observacao = p_observacao,
           origem = 'auto',
           updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.dados_brutos (tipo_id, area, data, valor, contexto, observacao, origem)
  VALUES (p_tipo_id, lower(p_area), p_data, p_valor, p_contexto, p_observacao, 'auto')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dado_bruto(text, text, date, numeric, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. SYNC CULTOS · frequencia_culto + conversoes por area (kids/ami/bridge/sede/online)
--    Janela: ultimas 4 semanas · 1 linha por (tipo, area, semana)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_cultos(p_dias_back int DEFAULT 28)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio date := current_date - p_dias_back;
  v_culto RECORD;
  v_total int := 0;
  v_segmento text;
BEGIN
  FOR v_culto IN
    SELECT data, nome,
           coalesce(presencial_adulto, 0) AS adultos,
           coalesce(presencial_kids, 0) AS kids,
           coalesce(decisoes_presenciais, 0) + coalesce(decisoes_online, 0) AS conversoes
      FROM public.cultos
     WHERE data >= v_inicio
       AND data <= current_date
  LOOP
    -- Frequencia adulto · segmenta por nome do culto
    IF lower(v_culto.nome) LIKE '%bridge%' THEN
      v_segmento := 'bridge';
    ELSIF lower(v_culto.nome) LIKE '%ami%'
       OR lower(v_culto.nome) LIKE '%sabado%'
       OR lower(v_culto.nome) LIKE '%sábado%' THEN
      v_segmento := 'ami';
    ELSIF lower(v_culto.nome) LIKE '%online%' THEN
      v_segmento := 'online';
    ELSE
      v_segmento := 'sede';
    END IF;

    PERFORM public.upsert_dado_bruto(
      'frequencia_culto', v_segmento, v_culto.data, v_culto.adultos,
      v_culto.nome, 'auto · vw_culto_stats'
    );
    v_total := v_total + 1;

    -- Conversoes seguem a mesma area do culto
    PERFORM public.upsert_dado_bruto(
      'conversoes', v_segmento, v_culto.data, v_culto.conversoes,
      v_culto.nome, 'auto · vw_culto_stats'
    );
    v_total := v_total + 1;

    -- Frequencia kids · independente do nome (kids tem servico paralelo em todo culto)
    IF v_culto.kids > 0 THEN
      PERFORM public.upsert_dado_bruto(
        'frequencia_culto', 'kids', v_culto.data, v_culto.kids,
        v_culto.nome, 'auto · presencial_kids'
      );
      v_total := v_total + 1;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_cultos(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. SYNC BATISMOS · count mensal · area = sede (default)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_batismos(p_meses_back int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio date := date_trunc('month', current_date - (p_meses_back || ' months')::interval)::date;
  v_total int := 0;
  v_periodo RECORD;
BEGIN
  FOR v_periodo IN
    SELECT date_trunc('month', data_realizacao)::date AS mes,
           count(*) AS qtde
      FROM public.batismo_inscricoes
     WHERE status = 'realizado'
       AND data_realizacao >= v_inicio
     GROUP BY 1
  LOOP
    PERFORM public.upsert_dado_bruto(
      'batismos', 'sede', v_periodo.mes, v_periodo.qtde,
      'mensal', 'auto · batismo_inscricoes status=realizado'
    );
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_batismos(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. SYNC VOLUNTARIOS · ativos + inativos_3m + recuperados (mensal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_voluntarios(p_meses_back int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int := 0;
  v_mes date;
  v_ativos int;
  v_inativos int;
  v_i int;
BEGIN
  FOR v_i IN 0..p_meses_back LOOP
    v_mes := date_trunc('month', current_date - (v_i || ' months')::interval)::date;

    -- Ativos no mes: ainda servindo (saiu_em IS NULL ou saiu_em depois desse mes)
    SELECT count(DISTINCT id) INTO v_ativos
      FROM public.mem_voluntarios
     WHERE de <= (v_mes + interval '1 month')::date
       AND (ate IS NULL OR ate >= v_mes);

    -- Inativos > 3 meses no fim do mes (sairam ate 3 meses antes)
    SELECT count(DISTINCT id) INTO v_inativos
      FROM public.mem_voluntarios
     WHERE ate IS NOT NULL
       AND ate < (v_mes - interval '3 months')::date
       AND ate >= (v_mes - interval '12 months')::date;

    PERFORM public.upsert_dado_bruto('voluntarios_ativos', 'sede', v_mes, v_ativos, 'mensal', 'auto · mem_voluntarios');
    PERFORM public.upsert_dado_bruto('voluntarios_inativos_3m', 'sede', v_mes, v_inativos, 'mensal', 'auto · sem servir > 3m');
    v_total := v_total + 2;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_voluntarios(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. SYNC DOACOES · doacoes_valor + doadores_count (mensal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_doacoes(p_meses_back int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int := 0;
  v_periodo RECORD;
BEGIN
  FOR v_periodo IN
    SELECT date_trunc('month', data)::date AS mes,
           coalesce(sum(valor), 0) AS valor_total,
           count(DISTINCT membro_id) AS doadores_unicos
      FROM public.mem_contribuicoes
     WHERE data >= date_trunc('month', current_date - (p_meses_back || ' months')::interval)::date
     GROUP BY 1
  LOOP
    PERFORM public.upsert_dado_bruto('doacoes_valor', 'sede', v_periodo.mes, v_periodo.valor_total, 'mensal', 'auto · sum(mem_contribuicoes.valor)');
    PERFORM public.upsert_dado_bruto('doadores_count', 'sede', v_periodo.mes, v_periodo.doadores_unicos, 'mensal', 'auto · count distinct(mem_contribuicoes.membro_id)');
    v_total := v_total + 2;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_doacoes(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. SYNC GRUPOS · frequencia_grupos + grupos_ativos (mensal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_grupos(p_meses_back int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int := 0;
  v_mes date;
  v_freq int;
  v_grupos int;
  v_i int;
BEGIN
  FOR v_i IN 0..p_meses_back LOOP
    v_mes := date_trunc('month', current_date - (v_i || ' months')::interval)::date;

    -- Frequentes em grupos: membros ativos no mes
    SELECT count(DISTINCT membro_id) INTO v_freq
      FROM public.mem_grupo_membros
     WHERE entrou_em <= (v_mes + interval '1 month')::date
       AND (saiu_em IS NULL OR saiu_em >= v_mes);

    -- Grupos ativos no mes
    SELECT count(*) INTO v_grupos
      FROM public.mem_grupos
     WHERE coalesce(ativo, true) = true;

    PERFORM public.upsert_dado_bruto('frequencia_grupos', 'sede', v_mes, v_freq, 'mensal', 'auto · mem_grupo_membros');
    PERFORM public.upsert_dado_bruto('grupos_ativos', 'sede', v_mes, v_grupos, 'mensal', 'auto · mem_grupos');
    v_total := v_total + 2;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_grupos(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. SYNC DEVOCIONAIS · devocionais por mes (area = derivada · default sede)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_devocionais(p_meses_back int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int := 0;
  v_periodo RECORD;
BEGIN
  -- Verifica se a tabela mem_devocionais existe (se nao, sai sem erro)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mem_devocionais') THEN
    RETURN 0;
  END IF;

  FOR v_periodo IN EXECUTE $sql$
    SELECT date_trunc('month', data)::date AS mes,
           count(*) AS qtde
      FROM public.mem_devocionais
     WHERE data >= date_trunc('month', current_date - ($1 || ' months')::interval)::date
     GROUP BY 1
  $sql$ USING p_meses_back
  LOOP
    PERFORM public.upsert_dado_bruto('devocionais', 'sede', v_periodo.mes, v_periodo.qtde, 'mensal', 'auto · mem_devocionais');
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_devocionais(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. SYNC JORNADA180 · inscricoes mensal · area = sede
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_jornada180(p_meses_back int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int := 0;
  v_mes date;
  v_qtde int;
  v_i int;
BEGIN
  FOR v_i IN 0..p_meses_back LOOP
    v_mes := date_trunc('month', current_date - (v_i || ' months')::interval)::date;
    SELECT count(*) INTO v_qtde
      FROM public.cui_jornada180
     WHERE data_encontro >= v_mes
       AND data_encontro < (v_mes + interval '1 month')::date;
    PERFORM public.upsert_dado_bruto('inscricoes_jornada180', 'sede', v_mes, v_qtde, 'mensal', 'auto · cui_jornada180');
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_jornada180(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. SYNC NOVOS CONVERTIDOS · taxa atendidos pos-culto (semanal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_convertidos_pos_culto(p_dias_back int DEFAULT 60)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int := 0;
  v_periodo RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cui_convertidos') THEN
    RETURN 0;
  END IF;

  FOR v_periodo IN EXECUTE $sql$
    SELECT data_culto::date AS dia, count(*) AS qtde
      FROM public.cui_convertidos
     WHERE atendido_apos_culto = true
       AND data_culto >= (current_date - ($1 || ' days')::interval)::date
     GROUP BY 1
  $sql$ USING p_dias_back
  LOOP
    PERFORM public.upsert_dado_bruto('novos_convertidos_atend', 'sede', v_periodo.dia, v_periodo.qtde, 'semanal', 'auto · cui_convertidos.atendido_apos_culto');
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_convertidos_pos_culto(int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- MASTER · roda todos os syncs · cron diario chama esta
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_dados_brutos_diario()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_resultado jsonb := '{}'::jsonb;
BEGIN
  v_resultado := jsonb_set(v_resultado, '{cultos}', to_jsonb(public.sync_dados_brutos_cultos(28)));
  v_resultado := jsonb_set(v_resultado, '{batismos}', to_jsonb(public.sync_dados_brutos_batismos(3)));
  v_resultado := jsonb_set(v_resultado, '{voluntarios}', to_jsonb(public.sync_dados_brutos_voluntarios(3)));
  v_resultado := jsonb_set(v_resultado, '{doacoes}', to_jsonb(public.sync_dados_brutos_doacoes(3)));
  v_resultado := jsonb_set(v_resultado, '{grupos}', to_jsonb(public.sync_dados_brutos_grupos(3)));
  v_resultado := jsonb_set(v_resultado, '{devocionais}', to_jsonb(public.sync_dados_brutos_devocionais(3)));
  v_resultado := jsonb_set(v_resultado, '{jornada180}', to_jsonb(public.sync_dados_brutos_jornada180(3)));
  v_resultado := jsonb_set(v_resultado, '{convertidos}', to_jsonb(public.sync_dados_brutos_convertidos_pos_culto(60)));
  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_dados_brutos_diario() TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_dados_brutos_diario() IS
  'Master sync · roda todas as funcoes de snapshot. Chamada pelo cron Vercel diario via /api/dados-brutos/cron/snapshot.';

-- ============================================================================
-- TIPOS QUE FICAM MANUAIS (sem fonte de dado natural):
--   - voluntarios_treinamento  (modulo de treinamento futuro)
--   - voluntarios_checkin      (precisa integracao Planning Center · futuro)
--   - voluntarios_alocados     (modulo Solicitacoes futuro)
--   - lideres_treinados        (modulo de treinamento futuro)
--   - lideres_acompanhados     (registro estruturado nao existe ainda)
--   - solicitacoes_*           (modulo Solicitacoes futuro)
--   - nps_*                    (modulo NPS futuro)
--   - frequencia_next          (modulo NEXT futuro)
--   - doacoes_qualidade / doadores_recorrentes (regras complexas, calculo SQL futuro)
--
-- Estes tipos continuam sendo preenchidos pelo lider em /dados-brutos.
-- Quando os modulos respectivos forem criados, adicionar mais funcoes
-- sync_dados_brutos_*().
-- ============================================================================
