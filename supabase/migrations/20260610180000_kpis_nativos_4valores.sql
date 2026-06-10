-- ============================================================================
-- KPIs NATIVOS DOS 4 PRIMEIROS VALORES · leva aprovada pelo Marcos (2026-06-10)
--
-- "A ideia é que o simples preencher de dados do sistema preencha todos os
--  KPIs — se um usuário usar corretamente seu módulo, teremos os dados de
--  forma nativa."
--
-- Três pernas:
--   A. RAMOS NATIVOS NOVOS no _kpi_agregar_dado · 10 dado_tipos que esperavam
--      digitação manual em /dados-brutos passam a ler as tabelas dos módulos:
--        lideres_treinados        → mem_grupo_membros.funcao='lider_treinamento'
--        lideres_acompanhados     → grupo_supervisao_visitas × mem_grupos
--        voluntarios_checkin      → vol_schedules × vol_check_ins (% escalados)
--        solicitacoes_servir_*    → vol_inscricoes (funil · tem área própria)
--        solicitacoes_capelania_* → cui_acompanhamentos (motivo ~ capelania)
--        solicitacoes_aconselh*   → cui_acompanhamentos (demais motivos)
--        frequencia_next          → next_inscricoes com check-in (igreja toda)
--   B. ÁREA DO BATISMO derivada da conversão · batismo_inscricoes.area_kpi
--      (default 'sede') passa a herdar a área de cui_convertidos quando a
--      pessoa converteu em ami/bridge/online (trigger + backfill) → liga os
--      coletores batismos.ami/bridge/online.
--   C. GATILHOS DE RECÁLCULO · até hoje só dados_brutos/cultos/batismos
--      disparavam recálculo — usar o módulo (grupos, voluntariado, devocional,
--      jornada 180...) não recalculava nada. Triggers statement-level nas
--      tabelas nativas + função kpi_recalcular_todos() (rede de segurança
--      chamada pelo cron diário do coletor).
--
-- Limitações documentadas (v1 · combinadas com o Marcos):
--   · frequencia_next e voluntarios_checkin são da igreja toda (Next e escala
--     não têm dimensão de área) — os KPIs por área exibem o mesmo valor.
--   · capelania/aconselhamento: o registro em cui_acompanhamentos já nasce de
--     um atendimento (não há fila própria de solicitações ainda), então o %
--     atendidas tende a 100 — ganha sentido quando houver canal de solicitação.
--   · Idem grupos/devocionais/jornada (ramos antigos): contagem da igreja toda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. _kpi_agregar_dado v3 · ramos nativos novos (cópia fiel da v2 de
--    20260508170000 + bloco novo antes do fallback dados_brutos)
-- ----------------------------------------------------------------------------
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

  -- CONVERSOES · cultos.decisoes_presenciais + decisoes_online
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

  -- BATISMOS · batismo_inscricoes status=realizado · respeita area_kpi quando
  -- a area pedida e uma das 5 (2026-06-10 · antes ignorava a area)
  ELSIF p_dado_tipo = 'batismos' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='batismo_inscricoes') THEN
      SELECT count(*) INTO v_resultado
        FROM public.batismo_inscricoes
       WHERE status = 'realizado'
         AND data_batismo >= p_data_inicio
         AND data_batismo <= p_data_fim
         AND (v_area_lower NOT IN ('kids','sede','ami','bridge','online')
              OR area_kpi = v_area_lower);
      RETURN v_resultado;
    END IF;

  -- VOLUNTARIOS ATIVOS · mem_voluntarios servindo no periodo
  ELSIF p_dado_tipo = 'voluntarios_ativos' THEN
    SELECT count(DISTINCT id) INTO v_resultado
      FROM public.mem_voluntarios
     WHERE desde <= p_data_fim
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

  -- VOLUNTARIOS RECUPERADOS · saiu antes E voltou no periodo
  ELSIF p_dado_tipo = 'voluntarios_recuperados' THEN
    SELECT count(DISTINCT v1.membro_id) INTO v_resultado
      FROM public.mem_voluntarios v1
     WHERE v1.desde >= p_data_inicio
       AND v1.desde <= p_data_fim
       AND EXISTS (
         SELECT 1 FROM public.mem_voluntarios v2
          WHERE v2.membro_id = v1.membro_id
            AND v2.ate IS NOT NULL
            AND v2.ate < v1.desde
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

  -- LIDERES DE GRUPOS · count distinct lider_id em mem_grupos
  ELSIF p_dado_tipo = 'lideres_grupos' THEN
    SELECT count(DISTINCT lider_id) INTO v_resultado
      FROM public.mem_grupos
     WHERE coalesce(ativo, true) = true
       AND lider_id IS NOT NULL;
    RETURN v_resultado;

  -- DEVOCIONAIS
  ELSIF p_dado_tipo = 'devocionais' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mem_devocionais') THEN
      SELECT count(*) INTO v_resultado
        FROM public.mem_devocionais
       WHERE data_devocional >= p_data_inicio
         AND data_devocional <= p_data_fim;
      RETURN v_resultado;
    END IF;

  -- INSCRICOES JORNADA 180
  ELSIF p_dado_tipo = 'inscricoes_jornada180' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_jornada180') THEN
      SELECT count(*) INTO v_resultado
        FROM public.cui_jornada180
       WHERE data_encontro >= p_data_inicio
         AND data_encontro <= p_data_fim;
      RETURN v_resultado;
    END IF;

  -- NOVOS CONVERTIDOS ATENDIDOS POS-CULTO
  ELSIF p_dado_tipo = 'novos_convertidos_atend' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cui_convertidos') THEN
      SELECT count(*) INTO v_resultado
        FROM public.cui_convertidos
       WHERE atendido_apos_culto = true
         AND data_culto >= p_data_inicio
         AND data_culto <= p_data_fim;
      RETURN v_resultado;
    END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- RAMOS NATIVOS NOVOS (2026-06-10 · leva "KPIs nativos dos 4 valores")
  -- ──────────────────────────────────────────────────────────────────────

  -- LIDERES EM TREINAMENTO · mem_grupo_membros.funcao='lider_treinamento'
  -- (snapshot: quem esta em treinamento ativo no fim do periodo)
  ELSIF p_dado_tipo = 'lideres_treinados' THEN
    SELECT count(DISTINCT membro_id) INTO v_resultado
      FROM public.mem_grupo_membros
     WHERE funcao = 'lider_treinamento'
       AND deleted_at IS NULL
       AND saiu_em IS NULL
       AND entrou_em <= p_data_fim;
    RETURN v_resultado;

  -- LIDERES ACOMPANHADOS · lideres de grupo com visita de supervisao no periodo
  ELSIF p_dado_tipo = 'lideres_acompanhados' THEN
    SELECT count(DISTINCT g.lider_id) INTO v_resultado
      FROM public.grupo_supervisao_visitas v
      JOIN public.mem_grupos g ON g.id = v.grupo_id
     WHERE v.data_visita BETWEEN p_data_inicio AND p_data_fim
       AND g.lider_id IS NOT NULL;
    RETURN v_resultado;

  -- % ESCALADOS COM CHECK-IN · vol_schedules × vol_check_ins (igreja toda ·
  -- escala nao tem dimensao de area) · NULL quando nao houve escala no periodo
  ELSIF p_dado_tipo = 'voluntarios_checkin' THEN
    SELECT CASE WHEN count(s.id) = 0 THEN NULL
                ELSE round(100.0 * count(ci.id)::numeric / count(s.id), 2) END
      INTO v_resultado
      FROM public.vol_schedules s
      JOIN public.vol_services sv ON sv.id = s.service_id
      LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id
     WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim;
    RETURN v_resultado;

  -- SOLICITACOES DE SERVIR · funil de vol_inscricoes (tem area propria)
  ELSIF p_dado_tipo = 'solicitacoes_servir_recebidas' THEN
    SELECT count(*) INTO v_resultado
      FROM public.vol_inscricoes
     WHERE data_inscricao::date BETWEEN p_data_inicio AND p_data_fim
       AND (v_area_lower NOT IN ('kids','sede','ami','bridge','online') OR area = v_area_lower);
    RETURN v_resultado;

  -- "alocada" = chegou ao ministerio (enviado_ministerio/integrado/kids)
  ELSIF p_dado_tipo = 'solicitacoes_servir_alocadas' THEN
    SELECT count(*) INTO v_resultado
      FROM public.vol_inscricoes
     WHERE data_inscricao::date BETWEEN p_data_inicio AND p_data_fim
       AND status IN ('enviado_ministerio', 'integrado', 'kids')
       AND (v_area_lower NOT IN ('kids','sede','ami','bridge','online') OR area = v_area_lower);
    RETURN v_resultado;

  -- CAPELANIA / ACONSELHAMENTO · cui_acompanhamentos (capelania = motivo
  -- contem "capelania" · aconselhamento = demais). "Recebidas" = iniciadas no
  -- periodo · "atendidas" = com pastor responsavel definido.
  -- ⚠️ hoje o registro ja nasce de um atendimento (sem fila propria) · o %
  -- tende a 100 · ganha sentido quando houver canal de solicitacao do membro.
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

  -- FREQUENCIA NEXT · check-ins de next_inscricoes no periodo (o Next e um
  -- evento da igreja toda · sem dimensao de area: mesmo valor pra toda area)
  ELSIF p_dado_tipo = 'frequencia_next' THEN
    SELECT count(*) INTO v_resultado
      FROM public.next_inscricoes
     WHERE check_in_at IS NOT NULL
       AND check_in_at::date BETWEEN p_data_inicio AND p_data_fim;
    RETURN v_resultado;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- FALLBACK · le de dados_brutos (preenchimento manual)
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

-- ----------------------------------------------------------------------------
-- B. Área do batismo herdada da conversão (ami/bridge/online) + backfill
--    Mantém o default 'sede' quando a pessoa não veio de conversão mapeada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_batismo_area_da_conversao()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_area text;
BEGIN
  IF NEW.membro_id IS NULL OR COALESCE(NEW.area_kpi, 'sede') <> 'sede' THEN
    RETURN NEW;
  END IF;
  SELECT area INTO v_area
    FROM public.cui_convertidos
   WHERE membro_id = NEW.membro_id
     AND deleted_at IS NULL
     AND area IN ('ami', 'bridge', 'online')
   ORDER BY data_culto DESC
   LIMIT 1;
  IF v_area IS NOT NULL THEN
    NEW.area_kpi := v_area;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_batismo_area_da_conversao ON public.batismo_inscricoes;
CREATE TRIGGER trg_batismo_area_da_conversao
  BEFORE INSERT OR UPDATE OF membro_id ON public.batismo_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_batismo_area_da_conversao();

COMMENT ON FUNCTION public.fn_batismo_area_da_conversao() IS
  'area_kpi do batismo herda a área da conversão (cui_convertidos) quando ami/bridge/online · alimenta os coletores batismos.<area>. Default segue sede.';

-- Backfill: inscrições em 'sede' (default) de pessoas convertidas em outra área
UPDATE public.batismo_inscricoes b
   SET area_kpi = sub.area
  FROM (
    SELECT DISTINCT ON (c.membro_id) c.membro_id, c.area
      FROM public.cui_convertidos c
     WHERE c.deleted_at IS NULL
       AND c.area IN ('ami', 'bridge', 'online')
     ORDER BY c.membro_id, c.data_culto DESC
  ) sub
 WHERE b.membro_id = sub.membro_id
   AND b.area_kpi = 'sede';

-- ----------------------------------------------------------------------------
-- C1. Recálculo por dado_tipo (apoio dos gatilhos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kpi_recalc_dado_tipos(p_tipos text[])
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND COALESCE(tipo_calculo, 'manual') <> 'manual'
       AND (formula_config->>'dado_tipo' = ANY(p_tipos)
            OR formula_config->>'numerador' = ANY(p_tipos)
            OR formula_config->>'denominador' = ANY(p_tipos))
  LOOP
    BEGIN
      PERFORM public.recalcular_kpi(r.id, NULL);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- KPI individual com erro não derruba o lote
    END;
  END LOOP;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_kpi_recalc_dado_tipos(text[]) TO service_role;

-- ----------------------------------------------------------------------------
-- C2. Trigger genérico · TG_ARGV[0] = CSV de dado_tipos a recalcular
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_kpi_recalc_nativo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Evita cascata (ex.: sync vol_profiles→mem_voluntarios roda em depth 2) ·
  -- o recálculo geral diário cobre o que escapar daqui.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  PERFORM public.fn_kpi_recalc_dado_tipos(string_to_array(TG_ARGV[0], ','));
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.tg_kpi_recalc_nativo() IS
  'Gatilho statement-level: usar o módulo recalcula os KPIs ligados aos dado_tipos (TG_ARGV[0] = CSV). Defesa em profundidade: kpi_recalcular_todos() roda no cron diário.';

-- ----------------------------------------------------------------------------
-- C3. Gatilhos nas tabelas nativas
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.mem_grupos;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupos
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('grupos_ativos,lideres_grupos,lideres_acompanhados');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.mem_grupo_membros;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupo_membros
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('frequencia_grupos,lideres_treinados');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.mem_voluntarios;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.mem_voluntarios
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('voluntarios_ativos,voluntarios_inativos_3m,voluntarios_recuperados');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.mem_devocionais;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.mem_devocionais
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('devocionais');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.cui_jornada180;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.cui_jornada180
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('inscricoes_jornada180');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.cui_acompanhamentos;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.cui_acompanhamentos
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('solicitacoes_capelania,solicitacoes_capelania_recebidas,solicitacoes_aconselh,solicitacoes_aconselhamento_recebidas');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.cui_convertidos;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.cui_convertidos
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('novos_convertidos_atend');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.next_inscricoes;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.next_inscricoes
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('frequencia_next');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.vol_check_ins;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.vol_check_ins
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('voluntarios_checkin');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.vol_inscricoes;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.vol_inscricoes
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('solicitacoes_servir_recebidas,solicitacoes_servir_alocadas');

DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.grupo_supervisao_visitas;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.grupo_supervisao_visitas
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('lideres_acompanhados');

-- batismo_inscricoes já tem trigger pra fonte_auto (kpi_recalcular_para_data) ·
-- este cobre o dado_tipo 'batismos' (KIDS-03 etc)
DROP TRIGGER IF EXISTS trg_kpi_nativo_recalc ON public.batismo_inscricoes;
CREATE TRIGGER trg_kpi_nativo_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.batismo_inscricoes
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_kpi_recalc_nativo('batismos');

-- ----------------------------------------------------------------------------
-- C4. Recálculo geral (rede de segurança · cron diário do coletor chama)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_recalcular_todos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_ok int := 0;
  v_erro int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.kpi_indicadores_taticos
     WHERE ativo = true AND COALESCE(tipo_calculo, 'manual') <> 'manual'
  LOOP
    BEGIN
      PERFORM public.recalcular_kpi(r.id, NULL);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erro := v_erro + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('recalculados', v_ok, 'erros', v_erro);
END $$;

GRANT EXECUTE ON FUNCTION public.kpi_recalcular_todos() TO service_role;

COMMENT ON FUNCTION public.kpi_recalcular_todos() IS
  'Recalcula todos os KPIs ativos não-manuais (período corrente). Rede de segurança do cron diário /api/kpis/v2/cron/coletar · cobre o que os gatilhos por tabela não pegarem.';

-- ----------------------------------------------------------------------------
-- D. Roda 1x agora
-- ----------------------------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  v := public.kpi_recalcular_todos();
  RAISE NOTICE 'kpi_recalcular_todos: %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT area_kpi, count(*) FROM batismo_inscricoes GROUP BY 1;
--   SELECT kpi_id, valor_calculado FROM kpi_valores_calculados
--    ORDER BY calculado_em DESC LIMIT 30;
-- ----------------------------------------------------------------------------
