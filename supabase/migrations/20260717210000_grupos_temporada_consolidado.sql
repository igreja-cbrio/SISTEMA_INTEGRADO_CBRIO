-- ============================================================================
-- Grupos · consolidação de temporada (fechamento · 2026-07-17)
--
-- Problema (Marcos 17/07): o relatório de grupos é calculado AO VIVO das
-- tabelas operacionais, filtrando pela temporada ATUAL do grupo. Quando a
-- temporada vira (os grupos "andam" pra próxima · troca do campo temporada),
-- a base histórica some — filtrar por uma temporada passada passa a dar zero.
-- Perde-se a evolução da igreja de uma temporada pra outra.
--
-- Solução (padrão "fechar os livros", igual ao fin_closing_mensal): ao ENCERRAR
-- uma temporada, congela-se os números dela numa tabela dedicada, ANTES da
-- virada. Depois disso, mover/editar/apagar grupos nunca mais altera o que
-- ficou salvo. O relatório passa a ler o congelado pras temporadas fechadas e
-- ao vivo pra atual. Decisão do Marcos: a partir da T2 (T1 não é resgatada).
--
-- Granularidade: agregado por temporada (1 linha) — atende "número de grupos,
-- inscrições, satisfação, frequência, líderes, líderes em treinamento". Um
-- snapshot por-grupo (drill-down) fica pra depois.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mem_temporada_consolidado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  temporada text NOT NULL,
  temporada_label text,
  data_inicio date,
  data_fim date,
  -- Métricas congeladas (mesmas definições do fn_grupos_kpis_relatorio, mas
  -- escopadas pela JANELA DE DATA da temporada — não por janela móvel de meses).
  num_grupos int NOT NULL DEFAULT 0,
  num_inscricoes int NOT NULL DEFAULT 0,          -- pedidos criados na janela
  num_membros int NOT NULL DEFAULT 0,             -- roster ativo no fechamento
  num_lideres int NOT NULL DEFAULT 0,
  num_lideres_treinamento int NOT NULL DEFAULT 0,
  satisfacao_lideres numeric,                     -- NPS de líderes na janela (nullable)
  satisfacao_lideres_data date,
  total_encontros int NOT NULL DEFAULT 0,
  total_presencas int NOT NULL DEFAULT 0,
  frequencia_media numeric NOT NULL DEFAULT 0,    -- presenças / encontro
  metricas_extra jsonb NOT NULL DEFAULT '{}'::jsonb, -- extensível sem migration
  consolidado_em timestamptz NOT NULL DEFAULT now(),
  consolidado_por uuid,
  consolidado_por_nome text,
  UNIQUE (temporada)
);

COMMENT ON TABLE public.mem_temporada_consolidado IS
  'Snapshot congelado dos KPIs de grupos por temporada (fechamento). Preenchido por fn_consolidar_temporada ao encerrar a temporada, antes da virada. Comparativo entre temporadas lê daqui.';

-- Não tem deleted_at de propósito: é registro histórico agregado (sem PII), a
-- correção é reconsolidar (upsert via UNIQUE(temporada)), não apagar.

ALTER TABLE public.mem_temporada_consolidado ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'mem_temporada_consolidado' AND policyname = 'mem_temporada_consolidado_select'
  ) THEN
    CREATE POLICY mem_temporada_consolidado_select ON public.mem_temporada_consolidado
      FOR SELECT TO authenticated
      USING (public.current_user_module_level('grupos') >= 1 OR public.is_super_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'mem_temporada_consolidado' AND policyname = 'mem_temporada_consolidado_service'
  ) THEN
    CREATE POLICY mem_temporada_consolidado_service ON public.mem_temporada_consolidado
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Compute: métricas de UMA temporada (sem gravar) ────────────────────────
-- Escopo por janela de data da própria temporada (mem_temporadas.data_inicio/
-- data_fim, com o fim limitado a hoje). Grupos/roster/líderes são a foto do
-- momento (grupos ainda etiquetados com a temporada); frequência e inscrições
-- são por data. Mesmas definições do relatório vivo, pra comparação bater.
CREATE OR REPLACE FUNCTION public.fn_temporada_metricas(p_temporada text)
RETURNS TABLE (
  num_grupos int,
  num_inscricoes int,
  num_membros int,
  num_lideres int,
  num_lideres_treinamento int,
  satisfacao_lideres numeric,
  satisfacao_lideres_data date,
  total_encontros int,
  total_presencas int,
  frequencia_media numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date;
  v_fim    date;
BEGIN
  SELECT t.data_inicio, LEAST(COALESCE(t.data_fim, CURRENT_DATE), CURRENT_DATE)
    INTO v_inicio, v_fim
    FROM public.mem_temporadas t WHERE t.id = p_temporada;
  v_inicio := COALESCE(v_inicio, DATE '2000-01-01');
  v_fim    := COALESCE(v_fim, CURRENT_DATE);

  RETURN QUERY
  WITH grupos_ativos AS (
    SELECT g.id, g.lider_id
      FROM public.mem_grupos g
     WHERE g.deleted_at IS NULL AND g.ativo = true
       AND g.temporada::text = p_temporada
  ),
  roster AS (
    SELECT m.funcao::text AS funcao
      FROM public.mem_grupo_membros m
      JOIN grupos_ativos ga ON ga.id = m.grupo_id
     WHERE m.saiu_em IS NULL AND m.deleted_at IS NULL
  ),
  enc AS (
    SELECT e.id
      FROM public.mem_grupo_encontros e
      JOIN grupos_ativos ga ON ga.id = e.grupo_id
     WHERE e.deleted_at IS NULL
       AND e.data >= v_inicio AND e.data <= v_fim
  ),
  pres AS (
    SELECT count(*)::int AS n
      FROM public.mem_grupo_encontro_presencas p
      JOIN enc ON enc.id = p.encontro_id
     WHERE p.presente = true
  ),
  nps AS (
    SELECT d.valor, d.data
      FROM public.dados_brutos d
     WHERE d.tipo_id = 'nps_lideres'
       AND d.data >= v_inicio AND d.data <= v_fim
     ORDER BY d.data DESC LIMIT 1
  ),
  insc AS (
    SELECT count(*)::int AS n
      FROM public.mem_grupo_pedidos pe
     WHERE pe.deleted_at IS NULL
       AND pe.created_at::date >= v_inicio AND pe.created_at::date <= v_fim
  )
  SELECT
    (SELECT count(*)::int FROM grupos_ativos),
    (SELECT n FROM insc),
    (SELECT count(*)::int FROM roster),
    (SELECT count(DISTINCT lider_id) FILTER (WHERE lider_id IS NOT NULL)::int FROM grupos_ativos),
    (SELECT count(*)::int FROM roster WHERE funcao = 'lider_treinamento'),
    (SELECT valor FROM nps),
    (SELECT data FROM nps),
    (SELECT count(*)::int FROM enc),
    (SELECT COALESCE(n, 0) FROM pres),
    CASE WHEN (SELECT count(*) FROM enc) > 0
         THEN round((SELECT COALESCE(n, 0) FROM pres)::numeric / (SELECT count(*) FROM enc), 1)
         ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_temporada_metricas(text) TO authenticated, service_role;

-- ── Persist: congela a temporada (upsert) ──────────────────────────────────
-- Idempotente-seguro: se já consolidada e p_forcar=false, devolve a linha
-- existente SEM recalcular (protege contra reconsolidar depois da virada, quando
-- os grupos já foram pra próxima temporada e o cálculo daria zero). p_forcar=true
-- recalcula e sobrescreve (correção deliberada).
CREATE OR REPLACE FUNCTION public.fn_consolidar_temporada(
  p_temporada text,
  p_por uuid DEFAULT NULL,
  p_por_nome text DEFAULT NULL,
  p_forcar boolean DEFAULT false
)
RETURNS public.mem_temporada_consolidado
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existe public.mem_temporada_consolidado;
  v_temp   public.mem_temporadas;
  v_m      record;
  v_out    public.mem_temporada_consolidado;
BEGIN
  SELECT * INTO v_existe FROM public.mem_temporada_consolidado WHERE temporada = p_temporada;
  IF v_existe.id IS NOT NULL AND NOT p_forcar THEN
    RETURN v_existe; -- já congelada · não recalcula sem forçar
  END IF;

  SELECT * INTO v_temp FROM public.mem_temporadas WHERE id = p_temporada;
  SELECT * INTO v_m FROM public.fn_temporada_metricas(p_temporada);

  INSERT INTO public.mem_temporada_consolidado AS c (
    temporada, temporada_label, data_inicio, data_fim,
    num_grupos, num_inscricoes, num_membros, num_lideres, num_lideres_treinamento,
    satisfacao_lideres, satisfacao_lideres_data,
    total_encontros, total_presencas, frequencia_media,
    consolidado_em, consolidado_por, consolidado_por_nome
  ) VALUES (
    p_temporada, v_temp.label, v_temp.data_inicio, v_temp.data_fim,
    v_m.num_grupos, v_m.num_inscricoes, v_m.num_membros, v_m.num_lideres, v_m.num_lideres_treinamento,
    v_m.satisfacao_lideres, v_m.satisfacao_lideres_data,
    v_m.total_encontros, v_m.total_presencas, v_m.frequencia_media,
    now(), p_por, p_por_nome
  )
  ON CONFLICT (temporada) DO UPDATE SET
    temporada_label = EXCLUDED.temporada_label,
    data_inicio = EXCLUDED.data_inicio,
    data_fim = EXCLUDED.data_fim,
    num_grupos = EXCLUDED.num_grupos,
    num_inscricoes = EXCLUDED.num_inscricoes,
    num_membros = EXCLUDED.num_membros,
    num_lideres = EXCLUDED.num_lideres,
    num_lideres_treinamento = EXCLUDED.num_lideres_treinamento,
    satisfacao_lideres = EXCLUDED.satisfacao_lideres,
    satisfacao_lideres_data = EXCLUDED.satisfacao_lideres_data,
    total_encontros = EXCLUDED.total_encontros,
    total_presencas = EXCLUDED.total_presencas,
    frequencia_media = EXCLUDED.frequencia_media,
    consolidado_em = now(),
    consolidado_por = EXCLUDED.consolidado_por,
    consolidado_por_nome = EXCLUDED.consolidado_por_nome
  RETURNING * INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_consolidar_temporada(text, uuid, text, boolean) TO authenticated, service_role;

-- Conferência (Studio):
-- SELECT * FROM public.fn_temporada_metricas('T2-2026');
-- SELECT * FROM public.fn_consolidar_temporada('T2-2026', NULL, 'teste', true);
-- ============================================================================
