-- ============================================================================
-- SERVIR + GENEROSIDADE ganham dimensão de ÁREA DE CULTO
--
-- Marcos (2026-06-10): "quando vamos para a mandala de Servir em Comunidade,
-- deveria ter separado por área de culto quantos voluntários são de cada
-- culto... a mesma coisa Viver Generosamente".
--
-- Contexto: a cascata por área das mandalas (2026-06-09) só cobria Seguir
-- porque mem_voluntarios e mem_contribuicoes não tinham coluna de área.
-- Esta migration dá a dimensão:
--   1. mem_voluntarios.area + mem_contribuicoes.area (kids/sede/ami/bridge/
--      online · nullable — sem área conhecida conta no total, fora das pétalas).
--   2. Backfill de mem_voluntarios.area em 2 passes de confiança:
--      a) área da inscrição de voluntário da pessoa (vol_inscricoes.area);
--      b) área onde a pessoa MAIS SERVE nas escalas (vol_schedules ×
--         vol_services · team com "kid" → kids · serviço AMI/Bridge → ami/
--         bridge · Domingo/Quarta → sede).
--   3. Sync vol_profiles→mem_voluntarios passa a preencher a área (via
--      inscrição da pessoa).
--   4. _kpi_agregar_dado: ramos de voluntários e doações passam a respeitar
--      a área quando o registro a tem (KPIs por área deixam de repetir o
--      número global · registro sem área não conta nas áreas).
--
-- mem_contribuicoes.area fica como ESTRUTURA PRONTA pra unificação com o
-- sistema financeiro externo (decisão do Marcos) — a importação futura
-- preenche; a mandala já lê.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas de área
-- ----------------------------------------------------------------------------
ALTER TABLE public.mem_voluntarios
  ADD COLUMN IF NOT EXISTS area text
  CHECK (area IS NULL OR area IN ('kids', 'sede', 'ami', 'bridge', 'online'));

COMMENT ON COLUMN public.mem_voluntarios.area IS
  'Área de culto onde o voluntário serve · alimenta a cascata da mandala Servir e os KPIs por área. NULL = não mapeada (conta no total da igreja).';

ALTER TABLE public.mem_contribuicoes
  ADD COLUMN IF NOT EXISTS area text
  CHECK (area IS NULL OR area IN ('kids', 'sede', 'ami', 'bridge', 'online'));

COMMENT ON COLUMN public.mem_contribuicoes.area IS
  'Área de culto da contribuição · estrutura pronta pra unificação com o sistema financeiro externo. NULL = não mapeada.';

-- ----------------------------------------------------------------------------
-- 2a. Backfill · área da inscrição de voluntário (fonte mais explícita)
-- ----------------------------------------------------------------------------
UPDATE public.mem_voluntarios mv
   SET area = sub.area
  FROM (
    SELECT DISTINCT ON (vi.membro_id) vi.membro_id, vi.area
      FROM public.vol_inscricoes vi
     WHERE vi.membro_id IS NOT NULL
       AND vi.area IN ('kids', 'sede', 'ami', 'bridge', 'online')
     ORDER BY vi.membro_id, vi.data_inscricao DESC
  ) sub
 WHERE mv.membro_id = sub.membro_id
   AND mv.area IS NULL
   AND mv.deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2b. Backfill · área onde a pessoa MAIS SERVE (moda das escalas)
--     team com "kid" → kids · serviço AMI → ami · Bridge → bridge ·
--     Domingo/Quarta → sede (espelha os filtros do painel/kpiAutoCollector)
-- ----------------------------------------------------------------------------
UPDATE public.mem_voluntarios mv
   SET area = sub.area
  FROM (
    SELECT DISTINCT ON (t.membro_id) t.membro_id, t.area
      FROM (
        SELECT vp.membresia_id AS membro_id,
               CASE
                 WHEN lower(coalesce(s.team_name, '')) LIKE '%kid%' THEN 'kids'
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%ami%'
                   OR lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%sabado%'
                   OR lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%sábado%' THEN
                   CASE WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%bridge%' THEN 'bridge' ELSE 'ami' END
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%bridge%' THEN 'bridge'
                 WHEN lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%domingo%'
                   OR lower(coalesce(sv.service_type_name, sv.name, '')) LIKE '%quarta%' THEN 'sede'
                 ELSE NULL
               END AS area,
               count(*) AS qtd
          FROM public.vol_schedules s
          JOIN public.vol_services sv ON sv.id = s.service_id
          JOIN public.vol_profiles vp ON vp.id = s.volunteer_id
         WHERE vp.membresia_id IS NOT NULL
         GROUP BY 1, 2
      ) t
     WHERE t.area IS NOT NULL
     ORDER BY t.membro_id, t.qtd DESC
  ) sub
 WHERE mv.membro_id = sub.membro_id
   AND mv.area IS NULL
   AND mv.deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Sync vol_profiles → mem_voluntarios v2 · preenche a área na criação
--    (lookup barato pela inscrição da pessoa · escala fica pro backfill/ajuste)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vol_profile_sync_mem_voluntarios()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ministerio uuid;
  v_area text;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mem_voluntarios
     WHERE membro_id = NEW.membresia_id AND ate IS NULL AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_ministerio
    FROM public.mem_ministerios
   WHERE nome = 'Voluntariado (geral)'
   LIMIT 1;
  IF v_ministerio IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vi.area INTO v_area
    FROM public.vol_inscricoes vi
   WHERE vi.membro_id = NEW.membresia_id
     AND vi.area IN ('kids', 'sede', 'ami', 'bridge', 'online')
   ORDER BY vi.data_inscricao DESC
   LIMIT 1;

  INSERT INTO public.mem_voluntarios (membro_id, ministerio_id, papel, desde, area, observacoes)
  VALUES (
    NEW.membresia_id,
    v_ministerio,
    'Voluntário',
    COALESCE(NEW.created_at::date, CURRENT_DATE),
    v_area,
    'Auto: sync do voluntariado (vol_profiles.id=' || NEW.id::text || ')'
  );

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 4. _kpi_agregar_dado · ramos de voluntários e doações respeitam a área
--    (só os ramos alterados · resto idêntico à versão 20260610180000)
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

  -- LIDERES DE GRUPOS
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

  -- LIDERES EM TREINAMENTO
  ELSIF p_dado_tipo = 'lideres_treinados' THEN
    SELECT count(DISTINCT membro_id) INTO v_resultado
      FROM public.mem_grupo_membros
     WHERE funcao = 'lider_treinamento'
       AND deleted_at IS NULL
       AND saiu_em IS NULL
       AND entrou_em <= p_data_fim;
    RETURN v_resultado;

  -- LIDERES ACOMPANHADOS
  ELSIF p_dado_tipo = 'lideres_acompanhados' THEN
    SELECT count(DISTINCT g.lider_id) INTO v_resultado
      FROM public.grupo_supervisao_visitas v
      JOIN public.mem_grupos g ON g.id = v.grupo_id
     WHERE v.data_visita BETWEEN p_data_inicio AND p_data_fim
       AND g.lider_id IS NOT NULL;
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

GRANT EXECUTE ON FUNCTION public._kpi_agregar_dado(text, text, date, date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Recalcula o período fechado com a nova dimensão
-- ----------------------------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  v := public.kpi_recalcular_todos();
  RAISE NOTICE 'kpi_recalcular_todos: %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT area, count(*) FROM mem_voluntarios
--    WHERE ate IS NULL AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;
--   -- esperado: maioria dos 273 com área (inscrição ou escala) · NULL = resto
-- ----------------------------------------------------------------------------
