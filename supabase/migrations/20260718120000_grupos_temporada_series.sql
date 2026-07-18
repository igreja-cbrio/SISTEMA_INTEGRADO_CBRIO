-- ============================================================================
-- Grupos · séries mensais + tamanho dos grupos por temporada (2026-07-18)
--
-- Marcos: no relatório da temporada, ver a evolução mensal de FREQUÊNCIA,
-- INSCRIÇÕES e MEMBRESIA num gráfico só (com filtro de qual série mostrar) —
-- deixa claro o funil "quem só se inscreveu × quem entrou no grupo × quem
-- participa". E um gráfico da MÉDIA/distribuição de pessoas por grupo.
--
-- Tudo escopado pela JANELA DE DATA da temporada (igual fn_temporada_metricas /
-- consolidação) e agregado em SQL (cap-safe · encontros/presenças/roster passam
-- de 1000 linhas). STABLE SECURITY DEFINER. Sem tabela nova.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_temporada_series(p_temporada text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio date;
  v_fim    date;
  v_serie  jsonb;
  v_tam    jsonb;
BEGIN
  SELECT t.data_inicio, LEAST(COALESCE(t.data_fim, CURRENT_DATE), CURRENT_DATE)
    INTO v_inicio, v_fim
    FROM public.mem_temporadas t WHERE t.id = p_temporada;
  v_inicio := COALESCE(v_inicio, DATE '2000-01-01');
  v_fim    := COALESCE(v_fim, CURRENT_DATE);

  -- Série mensal: presenças/encontros (frequência), inscrições (pedidos) e
  -- membresia (novos vínculos por entrou_em) — num mês só, mesmo eixo.
  WITH ga AS (
    SELECT id FROM public.mem_grupos
     WHERE deleted_at IS NULL AND ativo = true AND temporada::text = p_temporada
  ),
  meses AS (
    SELECT to_char(d, 'YYYY-MM') AS ym
      FROM generate_series(date_trunc('month', v_inicio), date_trunc('month', v_fim), interval '1 month') d
  ),
  pres AS (
    SELECT to_char(e.data, 'YYYY-MM') AS ym,
           count(*) FILTER (WHERE p.presente) AS presencas,
           count(DISTINCT e.id) AS encontros
      FROM public.mem_grupo_encontros e
      JOIN ga ON ga.id = e.grupo_id
      LEFT JOIN public.mem_grupo_encontro_presencas p ON p.encontro_id = e.id
     WHERE e.deleted_at IS NULL AND e.data >= v_inicio AND e.data <= v_fim
     GROUP BY 1
  ),
  insc AS (
    SELECT to_char(pe.created_at, 'YYYY-MM') AS ym, count(*) AS n
      FROM public.mem_grupo_pedidos pe
     WHERE pe.deleted_at IS NULL
       AND pe.created_at::date >= v_inicio AND pe.created_at::date <= v_fim
     GROUP BY 1
  ),
  memb AS (
    SELECT to_char(mm.entrou_em, 'YYYY-MM') AS ym, count(*) AS n
      FROM public.mem_grupo_membros mm
      JOIN ga ON ga.id = mm.grupo_id
     WHERE mm.deleted_at IS NULL
       AND mm.entrou_em >= v_inicio AND mm.entrou_em <= v_fim
     GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'ym', m.ym,
             'presencas',  COALESCE(pr.presencas, 0),
             'encontros',  COALESCE(pr.encontros, 0),
             'inscricoes', COALESCE(i.n, 0),
             'membros',    COALESCE(mb.n, 0)
           ) ORDER BY m.ym
         ), '[]'::jsonb)
    INTO v_serie
    FROM meses m
    LEFT JOIN pres pr ON pr.ym = m.ym
    LEFT JOIN insc i  ON i.ym = m.ym
    LEFT JOIN memb mb ON mb.ym = m.ym;

  -- Tamanho por grupo: média, mediana e histograma por faixa (roster ativo).
  WITH ga AS (
    SELECT id FROM public.mem_grupos
     WHERE deleted_at IS NULL AND ativo = true AND temporada::text = p_temporada
  ),
  cnt AS (
    SELECT ga.id,
           count(mm.id) FILTER (WHERE mm.saiu_em IS NULL AND mm.deleted_at IS NULL) AS n
      FROM ga
      LEFT JOIN public.mem_grupo_membros mm ON mm.grupo_id = ga.id
     GROUP BY ga.id
  ),
  faixas AS (
    SELECT CASE WHEN n = 0 THEN '0'
                WHEN n <= 5 THEN '1-5'
                WHEN n <= 10 THEN '6-10'
                WHEN n <= 15 THEN '11-15'
                WHEN n <= 20 THEN '16-20'
                ELSE '20+' END AS faixa,
           CASE WHEN n = 0 THEN 0
                WHEN n <= 5 THEN 1
                WHEN n <= 10 THEN 2
                WHEN n <= 15 THEN 3
                WHEN n <= 20 THEN 4
                ELSE 5 END AS ord,
           count(*) AS q
      FROM cnt GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'total_grupos',      (SELECT count(*) FROM cnt),
    'com_membros',       (SELECT count(*) FROM cnt WHERE n > 0),
    'total_pessoas',     (SELECT COALESCE(sum(n), 0) FROM cnt),
    'media',             (SELECT CASE WHEN count(*) > 0 THEN round(sum(n)::numeric / count(*), 1) ELSE 0 END FROM cnt),
    'media_com_membros', (SELECT CASE WHEN count(*) FILTER (WHERE n > 0) > 0 THEN round(sum(n)::numeric / count(*) FILTER (WHERE n > 0), 1) ELSE 0 END FROM cnt),
    'mediana',           (SELECT COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::numeric, 1), 0) FROM cnt),
    'distribuicao',      (SELECT COALESCE(jsonb_agg(jsonb_build_object('faixa', faixa, 'n', q) ORDER BY ord), '[]'::jsonb) FROM faixas)
  ) INTO v_tam;

  RETURN jsonb_build_object('serie', v_serie, 'tamanho', v_tam);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_temporada_series(text) TO authenticated, service_role;

-- Conferência (Studio):
-- SELECT public.fn_temporada_series('T2-2026');
-- ============================================================================
