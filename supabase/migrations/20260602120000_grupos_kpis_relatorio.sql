-- ============================================================================
-- Modulo Grupos · relatorio agregado de KPIs (tela /grupos > aba Relatorios)
--
-- Marcos: "crie uma area dentro de grupos que seja possivel ver os relatorios
--          de kpis de grupos, como fizemos em integracao... frequencia, numero
--          de lideres, numero de grupos, satisfacao dos lideres e quantidade de
--          lideres em treinamento"
--
-- Uma RPC unica agrega tudo server-side em 1 chamada. Motivos:
--   - Evita o cap de 1000 linhas do PostgREST (encontros + presencas crescem
--     rapido · ver nota no CLAUDE.md) que silenciaria a frequencia.
--   - Mesma fonte de verdade que a saude agregada (mem_grupo_encontros +
--     mem_grupo_encontro_presencas) e a hierarquia (mem_grupo_membros.funcao).
--
-- Metricas retornadas (todas filtraveis por temporada e janela de meses):
--   - total_grupos          · count grupos ativos
--   - total_lideres         · count distinct lider_id dos grupos ativos
--   - lideres_treinamento   · count membros funcao='lider_treinamento'
--   - satisfacao_lideres    · ultimo NPS registrado (dados_brutos.nps_lideres)
--   - frequencia            · media por encontro + serie mensal de presencas
--   - funcoes               · distribuicao de papeis (substancia os numeros)
--
-- ADITIVA · CREATE OR REPLACE · nao altera schema nem comportamento existente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_grupos_kpis_relatorio(
  p_temporada text DEFAULT NULL,
  p_meses     int  DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio              date;
  v_fim                 date := CURRENT_DATE;
  v_total_grupos        int;
  v_total_lideres       int;
  v_funcoes             jsonb;
  v_lideres_treinamento int;
  v_nps                 jsonb;
  v_total_presencas     bigint;
  v_total_encontros     bigint;
  v_serie               jsonb;
BEGIN
  -- janela: 1 a 60 meses (default 12) · primeiro dia do mes mais antigo
  p_meses  := greatest(least(coalesce(p_meses, 12), 60), 1);
  v_inicio := (date_trunc('month', CURRENT_DATE) - ((p_meses - 1) || ' months')::interval)::date;

  -- normaliza temporada vazia para NULL (sem filtro)
  IF p_temporada IS NOT NULL AND btrim(p_temporada) = '' THEN
    p_temporada := NULL;
  END IF;

  -- 1. grupos ativos · total + lideres distintos
  WITH grupos_ativos AS (
    SELECT g.id, g.lider_id
      FROM public.mem_grupos g
     WHERE g.deleted_at IS NULL
       AND g.ativo = true
       AND (p_temporada IS NULL OR g.temporada::text = p_temporada)
  )
  SELECT count(*)::int,
         count(DISTINCT lider_id) FILTER (WHERE lider_id IS NOT NULL)::int
    INTO v_total_grupos, v_total_lideres
    FROM grupos_ativos;

  -- 2. distribuicao de funcoes (membros ativos dos grupos ativos)
  SELECT coalesce(jsonb_object_agg(funcao, n), '{}'::jsonb)
    INTO v_funcoes
    FROM (
      SELECT m.funcao::text AS funcao, count(*)::int AS n
        FROM public.mem_grupo_membros m
        JOIN public.mem_grupos g ON g.id = m.grupo_id
       WHERE m.saiu_em IS NULL
         AND m.deleted_at IS NULL
         AND g.deleted_at IS NULL
         AND g.ativo = true
         AND (p_temporada IS NULL OR g.temporada::text = p_temporada)
       GROUP BY m.funcao
    ) t;

  v_lideres_treinamento := coalesce((v_funcoes->>'lider_treinamento')::int, 0);

  -- 3. satisfacao dos lideres · ultimo NPS registrado (qualquer area)
  SELECT jsonb_build_object('valor', d.valor, 'data', d.data)
    INTO v_nps
    FROM public.dados_brutos d
   WHERE d.tipo_id = 'nps_lideres'
   ORDER BY d.data DESC
   LIMIT 1;

  -- 4. frequencia · encontros + presencas agregadas por mes
  WITH enc AS (
    SELECT e.id, to_char(e.data, 'YYYY-MM') AS ym
      FROM public.mem_grupo_encontros e
      JOIN public.mem_grupos g ON g.id = e.grupo_id
     WHERE e.deleted_at IS NULL
       AND g.deleted_at IS NULL
       AND g.ativo = true
       AND (p_temporada IS NULL OR g.temporada::text = p_temporada)
       AND e.data >= v_inicio
       AND e.data <= v_fim
  ),
  pres AS (
    SELECT p.encontro_id, count(*)::int AS n
      FROM public.mem_grupo_encontro_presencas p
      JOIN enc ON enc.id = p.encontro_id
     WHERE p.presente = true
     GROUP BY p.encontro_id
  ),
  por_mes AS (
    SELECT enc.ym,
           count(*)::int            AS encontros,
           coalesce(sum(pres.n), 0) AS presencas
      FROM enc
      LEFT JOIN pres ON pres.encontro_id = enc.id
     GROUP BY enc.ym
  )
  SELECT coalesce(sum(presencas), 0)::bigint,
         coalesce(sum(encontros), 0)::bigint,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'ym',        ym,
               'presencas', presencas,
               'encontros', encontros,
               'media',     CASE WHEN encontros > 0
                                 THEN round(presencas::numeric / encontros, 1)
                                 ELSE 0 END
             ) ORDER BY ym
           ),
           '[]'::jsonb
         )
    INTO v_total_presencas, v_total_encontros, v_serie
    FROM por_mes;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('inicio', v_inicio, 'fim', v_fim, 'meses', p_meses),
    'total_grupos',         coalesce(v_total_grupos, 0),
    'total_lideres',        coalesce(v_total_lideres, 0),
    'lideres_treinamento',  v_lideres_treinamento,
    'satisfacao_lideres',   v_nps,
    'frequencia', jsonb_build_object(
      'total_presencas',    coalesce(v_total_presencas, 0),
      'total_encontros',    coalesce(v_total_encontros, 0),
      'media_por_encontro', CASE WHEN coalesce(v_total_encontros, 0) > 0
                                 THEN round(v_total_presencas::numeric / v_total_encontros, 1)
                                 ELSE 0 END,
      'serie',              v_serie
    ),
    'funcoes', v_funcoes
  );
END;
$$;

COMMENT ON FUNCTION public.fn_grupos_kpis_relatorio(text, int) IS
  'Relatorio agregado de KPIs do modulo Grupos · alimenta a aba /grupos > Relatorios';

GRANT EXECUTE ON FUNCTION public.fn_grupos_kpis_relatorio(text, int) TO authenticated, service_role;

-- Conferencia (descomenta no Studio):
-- SELECT public.fn_grupos_kpis_relatorio(NULL, 12);
-- ============================================================================
