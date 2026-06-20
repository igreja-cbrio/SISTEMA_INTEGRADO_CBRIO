-- ============================================================================
-- Grupos · ÁREA por grupo + cascata na mandala (ótica do sistema). Pedido do
-- Marcos (2026-06-20): "grupos AMI, Bridge, Sede, Online — cada um preenche seu
-- dado e soma na mandala final."
--
-- Problema: os dados-tipos de grupos (frequencia_grupos, grupos_ativos,
-- lideres_grupos, lideres_treinados, lideres_acompanhados) eram calculados
-- GLOBAIS em _kpi_agregar_dado (sem filtro de área), e mem_grupos não tinha
-- coluna de área → os KPIs "grupos AMI/Bridge/Sede/Online" davam todos o mesmo
-- total e não cascateavam.
--
-- Aqui: (1) mem_grupos.area (ami/bridge/sede/online) + backfill por heurística
-- (nome/bairro) — só novos inserts e backfill; não há área em kids/cba (grupo
-- de conexão não existe nessas). (2) _kpi_agregar_dado passa a filtrar os 5
-- dados-tipos de grupos por área, com o MESMO helper v_filtra_area que cultos/
-- batismo/voluntários já usam. Resto da função idêntico à 20260611180000.
-- Aditiva e idempotente.
-- ============================================================================

-- 1) Coluna area + backfill --------------------------------------------------
ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'sede';

-- Backfill por heurística (nome/bairro/descrição). Online tem precedência (a
-- congregação responsável é a Online), depois adolescentes=bridge, jovens/AMI,
-- senão sede (o grosso). Espelha a classificação revisada com o Marcos.
UPDATE public.mem_grupos SET area = CASE
  WHEN lower(coalesce(bairro,'')) LIKE '%online%'
    OR lower(coalesce(nome,'')) LIKE '%online%'
    OR lower(coalesce(endereco,'')) LIKE '%online%'          THEN 'online'
  WHEN lower(coalesce(nome,'')) LIKE '%adolescente%'
    OR lower(coalesce(nome,'')) LIKE '%bridge%'
    OR lower(coalesce(descricao,'')) LIKE '%adolescente%'    THEN 'bridge'
  WHEN lower(coalesce(nome,'')) ~ '\mami\M'
    OR lower(coalesce(nome,'')) LIKE '%culto ami%'
    OR lower(coalesce(nome,'')) LIKE '%jovens 18%'
    OR lower(coalesce(nome,'')) LIKE '%jovens de 17%'        THEN 'ami'
  ELSE 'sede'
END;

DO $$ BEGIN
  ALTER TABLE public.mem_grupos
    ADD CONSTRAINT mem_grupos_area_check CHECK (area IN ('ami','bridge','sede','online'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.mem_grupos.area IS
  'Área/congregação do grupo (ami/bridge/sede/online) · alimenta a mandala por área (Conectar). Default sede.';

-- 2) _kpi_agregar_dado · agora os 5 dados-tipos de grupos filtram por área -----
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

  -- BATISMOS · respeita area_kpi
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

  -- VOLUNTARIOS ATIVOS · respeita area (2026-06-10)
  ELSIF p_dado_tipo = 'voluntarios_ativos' THEN
    SELECT count(DISTINCT id) INTO v_resultado
      FROM public.mem_voluntarios
     WHERE desde <= p_data_fim
       AND (ate IS NULL OR ate >= p_data_inicio)
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  -- VOLUNTARIOS INATIVOS > 3 MESES · respeita area
  ELSIF p_dado_tipo = 'voluntarios_inativos_3m' THEN
    SELECT count(DISTINCT id) INTO v_resultado
      FROM public.mem_voluntarios
     WHERE ate IS NOT NULL
       AND ate < (p_data_fim - interval '3 months')::date
       AND ate >= (p_data_fim - interval '12 months')::date
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  -- VOLUNTARIOS RECUPERADOS · respeita area
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

  -- DOACOES VALOR · respeita area (2026-06-10 · estrutura pra unificação)
  ELSIF p_dado_tipo = 'doacoes_valor' THEN
    SELECT coalesce(sum(valor), 0) INTO v_resultado
      FROM public.mem_contribuicoes
     WHERE data >= p_data_inicio AND data <= p_data_fim
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  -- DOADORES UNICOS · respeita area
  ELSIF p_dado_tipo = 'doadores_count' THEN
    SELECT count(DISTINCT membro_id) INTO v_resultado
      FROM public.mem_contribuicoes
     WHERE data >= p_data_inicio AND data <= p_data_fim
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  -- DOADORES RECORRENTES · respeita area
  ELSIF p_dado_tipo = 'doadores_recorrentes' THEN
    SELECT count(*) INTO v_resultado FROM (
      SELECT membro_id
        FROM public.mem_contribuicoes
       WHERE data >= p_data_inicio AND data <= p_data_fim
         AND (NOT v_filtra_area OR area = v_area_lower)
       GROUP BY membro_id
      HAVING count(DISTINCT date_trunc('month', data)) >= 3
    ) t;
    RETURN v_resultado;

  -- FREQUENCIA GRUPOS · membros ativos no periodo · POR ÁREA (join mem_grupos)
  ELSIF p_dado_tipo = 'frequencia_grupos' THEN
    SELECT count(DISTINCT gm.membro_id) INTO v_resultado
      FROM public.mem_grupo_membros gm
      JOIN public.mem_grupos g ON g.id = gm.grupo_id
     WHERE gm.entrou_em <= p_data_fim
       AND (gm.saiu_em IS NULL OR gm.saiu_em >= p_data_inicio)
       AND (NOT v_filtra_area OR g.area = v_area_lower);
    RETURN v_resultado;

  -- GRUPOS ATIVOS · count · POR ÁREA
  ELSIF p_dado_tipo = 'grupos_ativos' THEN
    SELECT count(*) INTO v_resultado
      FROM public.mem_grupos
     WHERE coalesce(ativo, true) = true
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  -- LIDERES DE GRUPOS · POR ÁREA
  ELSIF p_dado_tipo = 'lideres_grupos' THEN
    SELECT count(DISTINCT lider_id) INTO v_resultado
      FROM public.mem_grupos
     WHERE coalesce(ativo, true) = true
       AND lider_id IS NOT NULL
       AND (NOT v_filtra_area OR area = v_area_lower);
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

  -- INSCRICOES JORNADA 180 · turmas próprias de Cuidados, por ÁREA (fallback no legado)
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

  -- LIDERES EM TREINAMENTO · POR ÁREA (join mem_grupos)
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

  -- LIDERES ACOMPANHADOS · POR ÁREA
  ELSIF p_dado_tipo = 'lideres_acompanhados' THEN
    SELECT count(DISTINCT g.lider_id) INTO v_resultado
      FROM public.grupo_supervisao_visitas v
      JOIN public.mem_grupos g ON g.id = v.grupo_id
     WHERE v.data_visita BETWEEN p_data_inicio AND p_data_fim
       AND g.lider_id IS NOT NULL
       AND (NOT v_filtra_area OR g.area = v_area_lower);
    RETURN v_resultado;

  -- % ESCALADOS COM CHECK-IN
  ELSIF p_dado_tipo = 'voluntarios_checkin' THEN
    SELECT CASE WHEN count(s.id) = 0 THEN NULL
                ELSE round(100.0 * count(ci.id)::numeric / count(s.id), 2) END
      INTO v_resultado
      FROM public.vol_schedules s
      JOIN public.vol_services sv ON sv.id = s.service_id
      LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id
     WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim;
    RETURN v_resultado;

  -- SOLICITACOES DE SERVIR
  ELSIF p_dado_tipo = 'solicitacoes_servir_recebidas' THEN
    SELECT count(*) INTO v_resultado
      FROM public.vol_inscricoes
     WHERE data_inscricao::date BETWEEN p_data_inicio AND p_data_fim
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  ELSIF p_dado_tipo = 'solicitacoes_servir_alocadas' THEN
    SELECT count(*) INTO v_resultado
      FROM public.vol_inscricoes
     WHERE data_inscricao::date BETWEEN p_data_inicio AND p_data_fim
       AND status IN ('enviado_ministerio', 'integrado', 'kids')
       AND (NOT v_filtra_area OR area = v_area_lower);
    RETURN v_resultado;

  -- CAPELANIA / ACONSELHAMENTO
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

  -- FREQUENCIA NEXT
  ELSIF p_dado_tipo = 'frequencia_next' THEN
    SELECT count(*) INTO v_resultado
      FROM public.next_inscricoes
     WHERE check_in_at IS NOT NULL
       AND check_in_at::date BETWEEN p_data_inicio AND p_data_fim;
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
$$;
