-- Relatórios de Grupos com dimensão explícita. Indicadores transversais ainda
-- não estão concluídos: dados_brutos mantém sua unicidade legada nesta etapa.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
    OR (SELECT count(*) FROM igrejas WHERE ativa AND tipo='sede')<>1 THEN
    RAISE EXCEPTION 'Dimensão dos relatórios exige preparação com uma única Sede ativa.';
  END IF;
END $$;
ALTER TABLE public.dados_brutos ADD COLUMN IF NOT EXISTS igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.dados_brutos SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
-- Sem DEFAULT: produtor não migrado deixa origem desconhecida, não vira Sede.
CREATE INDEX IF NOT EXISTS dados_brutos_campus_data_idx ON public.dados_brutos(igreja_id,data DESC);
ALTER TABLE public.mem_temporada_consolidado ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.mem_temporada_consolidado SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.mem_temporada_consolidado ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE public.mem_temporada_consolidado ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
ALTER TABLE public.mem_temporada_consolidado DROP CONSTRAINT mem_temporada_consolidado_temporada_key;
ALTER TABLE public.mem_temporada_consolidado ADD CONSTRAINT temporada_campus_unique UNIQUE(igreja_id,temporada);
ALTER TABLE public.mem_temporada_consolidado ENABLE ROW LEVEL SECURITY;
CREATE POLICY temporada_consolidado_campus ON public.mem_temporada_consolidado AS RESTRICTIVE FOR ALL TO authenticated
  USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));

CREATE OR REPLACE FUNCTION public.fn_campus_grupos_exigir(p_igreja_id uuid,p_escrita boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
  IF p_igreja_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa) THEN
    RAISE EXCEPTION 'Campus ativo obrigatório.' USING ERRCODE='22023';
  END IF;
  IF current_setting('role',true)='service_role' THEN RETURN; END IF;
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR COALESCE(public.current_user_module_level('grupos'),0) < (CASE WHEN p_escrita THEN 3 ELSE 1 END)
    OR NOT public.fn_campus_dado_pessoal_permitido(p_igreja_id) THEN
    RAISE EXCEPTION 'Sem acesso ao campus ou ao módulo Grupos.' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_grupos_exigir(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_campus_grupos_exigir(uuid,boolean) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.fn_consolidar_temporada_campus(p_igreja_id uuid, p_temporada text, p_por uuid DEFAULT NULL::uuid, p_por_nome text DEFAULT NULL::text, p_forcar boolean DEFAULT false)
 RETURNS mem_temporada_consolidado
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existe public.mem_temporada_consolidado;
  v_temp   public.mem_temporadas;
  v_m      record;
  v_out    public.mem_temporada_consolidado;
BEGIN
  PERFORM public.fn_campus_grupos_exigir(p_igreja_id,true);
  IF current_setting('role',true)='authenticated' AND COALESCE(public.current_user_module_level('grupos'),0)<5 THEN
    RAISE EXCEPTION 'Consolidação exige nível 5 em Grupos.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_existe FROM public.mem_temporada_consolidado WHERE temporada = p_temporada AND igreja_id=p_igreja_id;
  IF v_existe.id IS NOT NULL AND NOT p_forcar THEN
    RETURN v_existe;
  END IF;

  SELECT * INTO v_temp FROM public.mem_temporadas WHERE id = p_temporada;
  SELECT * INTO v_m FROM public.fn_temporada_metricas_campus(p_igreja_id,p_temporada);

  INSERT INTO public.mem_temporada_consolidado AS c (
    igreja_id, temporada, temporada_label, data_inicio, data_fim,
    num_grupos, num_inscricoes, num_membros, num_lideres, num_lideres_treinamento,
    satisfacao_lideres, satisfacao_lideres_data,
    total_encontros, total_presencas, frequencia_media,
    consolidado_em, consolidado_por, consolidado_por_nome
  ) VALUES (
    p_igreja_id, p_temporada, v_temp.label, v_temp.data_inicio, v_temp.data_fim,
    v_m.num_grupos, v_m.num_inscricoes, v_m.num_membros, v_m.num_lideres, v_m.num_lideres_treinamento,
    v_m.satisfacao_lideres, v_m.satisfacao_lideres_data,
    v_m.total_encontros, v_m.total_presencas, v_m.frequencia_media,
    now(), p_por, p_por_nome
  )
  ON CONFLICT (igreja_id,temporada) DO UPDATE SET
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
$function$;

REVOKE ALL ON FUNCTION public.fn_consolidar_temporada_campus(uuid,text,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_consolidar_temporada_campus(uuid,text,uuid,text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_consolidar_temporada(p_temporada text, p_por uuid DEFAULT NULL::uuid, p_por_nome text DEFAULT NULL::text, p_forcar boolean DEFAULT false)
 RETURNS mem_temporada_consolidado
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_consolidar_temporada_campus(public.fn_campus_legado_escrita(),p_temporada,p_por,p_por_nome,p_forcar);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_grupos_kpis_relatorio_campus(p_igreja_id uuid, p_temporada text DEFAULT NULL::text, p_meses integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.fn_campus_grupos_exigir(p_igreja_id,false);
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
       WHERE g.igreja_id=p_igreja_id AND g.deleted_at IS NULL
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
           AND g.igreja_id=p_igreja_id AND g.deleted_at IS NULL
           AND g.ativo = true
           AND (p_temporada IS NULL OR g.temporada::text = p_temporada)
         GROUP BY m.funcao
      ) t;

    v_lideres_treinamento := coalesce((v_funcoes->>'lider_treinamento')::int, 0);

    -- 3. satisfacao dos lideres · ultimo NPS registrado (qualquer area)
    SELECT jsonb_build_object('valor', d.valor, 'data', d.data)
      INTO v_nps
      FROM public.dados_brutos d
     WHERE d.igreja_id=p_igreja_id AND d.tipo_id = 'nps_lideres'
     ORDER BY d.data DESC
     LIMIT 1;

    -- 4. frequencia · encontros + presencas agregadas por mes
    WITH enc AS (
      SELECT e.id, to_char(e.data, 'YYYY-MM') AS ym
        FROM public.mem_grupo_encontros e
        JOIN public.mem_grupos g ON g.id = e.grupo_id
       WHERE e.deleted_at IS NULL
         AND g.igreja_id=p_igreja_id AND g.deleted_at IS NULL
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
  $function$;

REVOKE ALL ON FUNCTION public.fn_grupos_kpis_relatorio_campus(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_grupos_kpis_relatorio_campus(uuid,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_grupos_kpis_relatorio(p_temporada text DEFAULT NULL::text, p_meses integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_grupos_kpis_relatorio_campus(public.fn_campus_legado_escrita(),p_temporada,p_meses);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_grupos_ultima_frequencia_campus(p_igreja_id uuid)
 RETURNS TABLE(membro_id uuid, ultima_data date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_campus_grupos_exigir(p_igreja_id,false);
  RETURN QUERY
    SELECT p.membro_id, max(e.data) AS ultima_data
      FROM public.mem_grupo_encontro_presencas p
      JOIN public.mem_grupo_encontros e
        ON e.id = p.encontro_id AND e.deleted_at IS NULL
      JOIN public.mem_grupos g
        ON g.id = e.grupo_id AND coalesce(g.ativo, true) = true AND g.deleted_at IS NULL
     WHERE g.igreja_id=p_igreja_id AND p.presente = true
     GROUP BY p.membro_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_grupos_ultima_frequencia_campus(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_grupos_ultima_frequencia_campus(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_grupos_ultima_frequencia()
 RETURNS TABLE(membro_id uuid, ultima_data date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM public.fn_grupos_ultima_frequencia_campus(public.fn_campus_legado_escrita());
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_temporada_metricas_campus(p_igreja_id uuid, p_temporada text)
 RETURNS TABLE(num_grupos integer, num_inscricoes integer, num_membros integer, num_lideres integer, num_lideres_treinamento integer, satisfacao_lideres numeric, satisfacao_lideres_data date, total_encontros integer, total_presencas integer, frequencia_media numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date;
  v_fim    date;
BEGIN
  PERFORM public.fn_campus_grupos_exigir(p_igreja_id,false);
  SELECT t.data_inicio, LEAST(COALESCE(t.data_fim, CURRENT_DATE), CURRENT_DATE)
    INTO v_inicio, v_fim
    FROM public.mem_temporadas t WHERE t.id = p_temporada;
  v_inicio := COALESCE(v_inicio, DATE '2000-01-01');
  v_fim    := COALESCE(v_fim, CURRENT_DATE);

  RETURN QUERY
  WITH grupos_ativos AS (
    SELECT g.id, g.lider_id
      FROM public.mem_grupos g
     WHERE g.igreja_id=p_igreja_id AND g.deleted_at IS NULL AND g.ativo = true
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
     WHERE d.igreja_id=p_igreja_id AND d.tipo_id = 'nps_lideres'
       AND d.data >= v_inicio AND d.data <= v_fim
     ORDER BY d.data DESC LIMIT 1
  ),
  insc AS (
    SELECT count(*)::int AS n
      FROM public.mem_grupo_pedidos pe
      JOIN grupos_ativos ga ON ga.id = pe.grupo_id
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
$function$;

REVOKE ALL ON FUNCTION public.fn_temporada_metricas_campus(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_temporada_metricas_campus(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_temporada_metricas(p_temporada text)
 RETURNS TABLE(num_grupos integer, num_inscricoes integer, num_membros integer, num_lideres integer, num_lideres_treinamento integer, satisfacao_lideres numeric, satisfacao_lideres_data date, total_encontros integer, total_presencas integer, frequencia_media numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM public.fn_temporada_metricas_campus(public.fn_campus_legado_escrita(),p_temporada);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_temporada_sem_presenca_campus(p_igreja_id uuid, p_temporada text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date;
  v_fim    date;
  v_out    jsonb;
BEGIN
  PERFORM public.fn_campus_grupos_exigir(p_igreja_id,true);
  SELECT t.data_inicio, LEAST(COALESCE(t.data_fim, CURRENT_DATE), CURRENT_DATE)
    INTO v_inicio, v_fim
    FROM public.mem_temporadas t WHERE t.id = p_temporada;
  v_inicio := COALESCE(v_inicio, DATE '2000-01-01');
  v_fim    := COALESCE(v_fim, CURRENT_DATE);

  WITH ga AS (
    SELECT id, nome, codigo, lider_id
      FROM public.mem_grupos
     WHERE igreja_id=p_igreja_id AND deleted_at IS NULL AND ativo = true AND temporada::text = p_temporada
  ),
  enc AS (
    SELECT e.id, e.grupo_id
      FROM public.mem_grupo_encontros e
      JOIN ga ON ga.id = e.grupo_id
     WHERE e.deleted_at IS NULL AND e.data >= v_inicio AND e.data <= v_fim
  ),
  grupos_com_enc AS (
    SELECT grupo_id, count(*)::int AS n_enc FROM enc GROUP BY grupo_id
  ),
  presentes AS (
    SELECT DISTINCT enc.grupo_id, p.membro_id
      FROM public.mem_grupo_encontro_presencas p
      JOIN enc ON enc.id = p.encontro_id
     WHERE p.presente = true
  ),
  sem AS (
    SELECT gce.grupo_id, gce.n_enc,
           mm.id AS participacao_id, mm.membro_id, mm.entrou_em,
           m.nome, m.telefone, m.foto_url
      FROM grupos_com_enc gce
      JOIN public.mem_grupo_membros mm ON mm.grupo_id = gce.grupo_id
       AND mm.saiu_em IS NULL AND mm.deleted_at IS NULL
       AND COALESCE(mm.funcao::text, 'frequentador') NOT IN ('lider', 'co_lider', 'lider_treinamento')
      JOIN ga ON ga.id = gce.grupo_id
      LEFT JOIN public.mem_membros m ON m.id = mm.membro_id
      LEFT JOIN presentes pr ON pr.grupo_id = mm.grupo_id AND pr.membro_id = mm.membro_id
     WHERE pr.membro_id IS NULL
       AND mm.membro_id IS DISTINCT FROM ga.lider_id
  )
  SELECT COALESCE(jsonb_agg(g ORDER BY (g->>'grupo_nome')), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'grupo_id', s.grupo_id,
               'grupo_nome', ga.nome,
               'grupo_codigo', ga.codigo,
               'total_encontros', s.n_enc,
               'membros', jsonb_agg(
                 jsonb_build_object(
                   'participacao_id', s.participacao_id,
                   'membro_id', s.membro_id,
                   'nome', s.nome,
                   'telefone', s.telefone,
                   'foto_url', s.foto_url,
                   'entrou_em', s.entrou_em
                 ) ORDER BY s.nome
               )
             ) AS g
        FROM sem s
        JOIN ga ON ga.id = s.grupo_id
       GROUP BY s.grupo_id, ga.nome, ga.codigo, s.n_enc
    ) q;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_temporada_sem_presenca_campus(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_temporada_sem_presenca_campus(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_temporada_sem_presenca(p_temporada text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_temporada_sem_presenca_campus(public.fn_campus_legado_escrita(),p_temporada);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_temporada_series_campus(p_igreja_id uuid, p_temporada text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date;
  v_fim    date;
  v_serie  jsonb;
  v_tam    jsonb;
BEGIN
  PERFORM public.fn_campus_grupos_exigir(p_igreja_id,false);
  SELECT t.data_inicio, LEAST(COALESCE(t.data_fim, CURRENT_DATE), CURRENT_DATE)
    INTO v_inicio, v_fim
    FROM public.mem_temporadas t WHERE t.id = p_temporada;
  v_inicio := COALESCE(v_inicio, DATE '2000-01-01');
  v_fim    := COALESCE(v_fim, CURRENT_DATE);

  WITH ga AS (
    SELECT id FROM public.mem_grupos
     WHERE igreja_id=p_igreja_id AND deleted_at IS NULL AND ativo = true AND temporada::text = p_temporada
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
      FROM public.mem_grupo_pedidos pe JOIN ga ON ga.id=pe.grupo_id
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

  WITH ga AS (
    SELECT id FROM public.mem_grupos
     WHERE igreja_id=p_igreja_id AND deleted_at IS NULL AND ativo = true AND temporada::text = p_temporada
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
$function$;

REVOKE ALL ON FUNCTION public.fn_temporada_series_campus(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_temporada_series_campus(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_temporada_series(p_temporada text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_temporada_series_campus(public.fn_campus_legado_escrita(),p_temporada);
END;
$function$;

ALTER VIEW public.vw_grupos_supervisao SET(security_invoker=true);
ALTER VIEW public.vw_kpi_trajetoria_atual SET(security_invoker=true);

CREATE OR REPLACE VIEW public.vw_grupos_supervisao WITH(security_invoker=true) AS
 SELECT g.id,
    g.nome,
    g.categoria,
    g.local,
    g.dia_semana,
    g.horario,
    g.bairro,
    g.ativo,
    g.temporada,
    g.status_temporada,
    g.lider_id,
    l.nome AS lider_nome,
    g.supervisor_id,
    s.nome AS supervisor_nome,
    ( SELECT count(*) AS count
           FROM mem_grupo_membros m
          WHERE m.grupo_id = g.id AND m.saiu_em IS NULL) AS total_membros,
    ( SELECT count(*) AS count
           FROM mem_grupo_membros m
          WHERE m.grupo_id = g.id AND m.saiu_em IS NULL AND m.funcao = 'lider_treinamento'::grupo_funcao) AS total_lider_treinamento,
    ( SELECT max(v.data_visita) AS max
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'realizada'::text) AS ultima_visita,
    ( SELECT count(*) AS count
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'realizada'::text AND v.data_visita >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date) AS visitas_mes_atual,
    ( SELECT min(v.data_visita) AS min
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'agendada'::text AND v.data_visita >= CURRENT_DATE) AS proxima_visita,
    g.igreja_id
   FROM mem_grupos g
     LEFT JOIN mem_membros l ON l.id = g.lider_id
     LEFT JOIN mem_membros s ON s.id = g.supervisor_id
  WHERE g.ativo = true AND g.deleted_at IS NULL;

UPDATE app_campus_cobertura SET api_validada=false,regressao_validada=false WHERE frente IN ('grupos','indicadores');
COMMIT;
