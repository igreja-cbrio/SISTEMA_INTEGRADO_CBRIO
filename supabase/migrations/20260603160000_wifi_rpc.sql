-- =====================================================================
-- Módulo WiFi · funções RPC de leitura (2026-06-03)
-- =====================================================================
-- Os endpoints de leitura usavam o pool pg direto (utils/supabase.query),
-- que falha no serverless da Vercel neste módulo. O caminho via cliente
-- supabase (.rpc) é o que o sync já usa com sucesso. Movemos resumo /
-- pessoas / cultos / perfil pra funções SECURITY DEFINER chamadas por rpc.
-- ADITIVA · idempotente (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_wifi_resumo()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pessoas',          (SELECT count(*) FROM public.vw_wifi_pessoas),
    'pessoas_membros',  (SELECT count(*) FROM public.vw_wifi_pessoas WHERE eh_membro),
    'pessoas_dizimam',  (SELECT count(*) FROM public.vw_wifi_pessoas WHERE dizima_oferta),
    'pessoas_servem',   (SELECT count(*) FROM public.vw_wifi_pessoas WHERE serve),
    'pessoas_em_grupo', (SELECT count(*) FROM public.vw_wifi_pessoas WHERE em_grupo),
    'conexoes_login',   (SELECT count(*) FROM public.wifi_conexoes WHERE deleted_at IS NULL AND evento='login'),
    'conexoes_30d',     (SELECT count(*) FROM public.wifi_conexoes WHERE deleted_at IS NULL AND evento='login'
                            AND timestamp_evento >= now() - interval '30 days')
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_wifi_pessoas(
  p_busca text DEFAULT NULL, p_culto uuid DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH filt AS (
    SELECT p.* FROM public.vw_wifi_pessoas p
     WHERE (
       COALESCE(p_busca,'') = ''
       OR lower(p.nome) LIKE '%'||lower(p_busca)||'%'
       OR (regexp_replace(COALESCE(p_busca,''),'\D','','g') <> ''
           AND p.cpf_norm LIKE '%'||regexp_replace(COALESCE(p_busca,''),'\D','','g')||'%')
     )
     AND (
       (p_culto IS NULL AND p_inicio IS NULL AND p_fim IS NULL)
       OR EXISTS (
          SELECT 1 FROM public.wifi_conexoes cx
          JOIN public.wifi_visitantes v2 ON v2.id = cx.wifi_visitante_id
          WHERE v2.cpf_norm = p.cpf_norm AND cx.evento='login' AND cx.deleted_at IS NULL
            AND (p_culto IS NULL OR cx.culto_id = p_culto)
            AND (p_inicio IS NULL OR cx.timestamp_evento >= p_inicio)
            AND (p_fim IS NULL OR cx.timestamp_evento < (p_fim + 1))
       )
     )
  ),
  paged AS (
    SELECT * FROM filt ORDER BY ultima_conexao DESC NULLS LAST, nome
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filt),
    'pessoas', COALESCE(
      (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ultima_conexao DESC NULLS LAST, x.nome) FROM paged x),
      '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_wifi_cultos(p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.data DESC, t.servico), '[]'::jsonb)
  FROM (
    SELECT c.id, c.data, c.nome AS culto_nome, st.name AS servico,
           count(*) FILTER (WHERE cx.evento='login')::int AS logins,
           count(DISTINCT upper(cx.mac_address)) FILTER (WHERE cx.evento='login')::int AS dispositivos,
           count(DISTINCT v.cpf_norm)::int AS pessoas_identificadas
      FROM public.cultos c
      JOIN public.vol_service_types st ON st.id = c.service_type_id
      LEFT JOIN public.wifi_conexoes cx ON cx.culto_id = c.id AND cx.deleted_at IS NULL
      LEFT JOIN public.wifi_visitantes v ON v.id = cx.wifi_visitante_id
     WHERE c.deleted_at IS NULL
       AND (p_inicio IS NULL OR c.data >= p_inicio)
       AND (p_fim IS NULL OR c.data <= p_fim)
     GROUP BY c.id, c.data, c.nome, st.name
     HAVING count(*) FILTER (WHERE cx.evento='login') > 0
     ORDER BY c.data DESC, st.name
     LIMIT 400
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.fn_wifi_pessoa(p_cpf text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpf text := regexp_replace(COALESCE(p_cpf,''),'\D','','g'); v_p jsonb; v_membro uuid;
BEGIN
  SELECT to_jsonb(x) INTO v_p FROM (SELECT * FROM public.vw_wifi_pessoas WHERE cpf_norm = v_cpf) x;
  IF v_p IS NULL THEN RETURN NULL; END IF;
  v_membro := (v_p->>'membro_id')::uuid;

  RETURN jsonb_build_object(
    'pessoa', v_p,
    'conexoes', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM (
        SELECT cx.id, cx.timestamp_evento, cx.mac_address, cx.evento, cx.culto_id,
               c.data AS culto_data, c.nome AS culto_nome, st.name AS servico
          FROM public.wifi_conexoes cx
          JOIN public.wifi_visitantes v ON v.id = cx.wifi_visitante_id
          LEFT JOIN public.cultos c ON c.id = cx.culto_id
          LEFT JOIN public.vol_service_types st ON st.id = c.service_type_id
         WHERE v.cpf_norm = v_cpf AND cx.deleted_at IS NULL AND cx.evento='login'
         ORDER BY cx.timestamp_evento DESC LIMIT 300) c),
    'freqServico', (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM (
        SELECT COALESCE(st.name,'(fora de culto)') AS servico,
               count(*)::int AS logins, count(DISTINCT c.data)::int AS dias
          FROM public.wifi_conexoes cx
          JOIN public.wifi_visitantes v ON v.id = cx.wifi_visitante_id
          LEFT JOIN public.cultos c ON c.id = cx.culto_id
          LEFT JOIN public.vol_service_types st ON st.id = c.service_type_id
         WHERE v.cpf_norm = v_cpf AND cx.deleted_at IS NULL AND cx.evento='login'
         GROUP BY COALESCE(st.name,'(fora de culto)') ORDER BY logins DESC) f),
    'cruzamento', jsonb_build_object(
      'membro', (SELECT to_jsonb(m) FROM (
          SELECT id,nome,status,data_conversao,batizado,data_batismo,data_membresia,origem_cadastro
            FROM public.mem_membros WHERE id = v_membro) m),
      'grupos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'nome',g.nome,'funcao',gm.funcao,'entrou_em',gm.entrou_em))
          FROM public.mem_grupo_membros gm JOIN public.mem_grupos g ON g.id=gm.grupo_id
         WHERE gm.membro_id=v_membro AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL), '[]'::jsonb),
      'voluntariado', COALESCE((SELECT jsonb_agg(jsonb_build_object('papel',mv.papel,'desde',mv.desde,'ministerio',mi.nome))
          FROM public.mem_voluntarios mv LEFT JOIN public.mem_ministerios mi ON mi.id=mv.ministerio_id
         WHERE mv.membro_id=v_membro AND mv.ate IS NULL AND mv.deleted_at IS NULL), '[]'::jsonb),
      'contribuicoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo',tipo,'qtd',qtd,'ultima',ultima)) FROM (
          SELECT tipo, count(*)::int AS qtd, max(data) AS ultima
            FROM public.mem_contribuicoes WHERE membro_id=v_membro AND deleted_at IS NULL
              AND data >= (CURRENT_DATE - 365) GROUP BY tipo ORDER BY max(data) DESC) cc), '[]'::jsonb),
      'trilha', COALESCE((SELECT jsonb_agg(jsonb_build_object('etapa',etapa,'data_conclusao',data_conclusao,'concluida',concluida))
          FROM public.mem_trilha_valores WHERE membro_id=v_membro AND deleted_at IS NULL), '[]'::jsonb),
      'batismos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'data_batismo',data_batismo,'created_at',created_at))
          FROM public.batismo_inscricoes WHERE deleted_at IS NULL AND (cpf=v_cpf OR membro_id=v_membro)), '[]'::jsonb),
      'decisoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',dp.id,'tipo_decisao',dp.tipo_decisao,'registrado_em',dp.registrado_em,'culto_data',c.data,'culto_nome',c.nome))
          FROM public.cultos_decisoes_pessoas dp LEFT JOIN public.cultos c ON c.id=dp.culto_id
         WHERE dp.deleted_at IS NULL AND (dp.cpf=v_cpf OR dp.membro_id=v_membro)), '[]'::jsonb),
      'next', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'evento_id',evento_id,'check_in_at',check_in_at,'created_at',created_at))
          FROM public.next_inscricoes WHERE cpf=v_cpf OR membro_id=v_membro), '[]'::jsonb)
    )
  );
END; $$;
