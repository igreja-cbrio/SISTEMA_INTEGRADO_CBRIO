-- =====================================================================
-- Módulo WiFi · filtros de categoria na lista de pessoas (2026-06-03)
-- =====================================================================
-- Adiciona filtros booleanos (membro / serve / grupo / dízima / batismo /
-- next / decisão) à fn_wifi_pessoas. Cada flag ligado = exige aquele vínculo
-- (combinam em AND). ADITIVA · recria a função (assinatura muda).
-- =====================================================================

DROP FUNCTION IF EXISTS public.fn_wifi_pessoas(text, uuid, date, date, int, int);

CREATE OR REPLACE FUNCTION public.fn_wifi_pessoas(
  p_busca text DEFAULT NULL, p_culto uuid DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0,
  p_membro boolean DEFAULT false, p_serve boolean DEFAULT false,
  p_grupo boolean DEFAULT false, p_dizima boolean DEFAULT false,
  p_batismo boolean DEFAULT false, p_next boolean DEFAULT false,
  p_decisao boolean DEFAULT false
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
     AND (NOT p_membro  OR p.eh_membro)
     AND (NOT p_serve   OR p.serve)
     AND (NOT p_grupo   OR p.em_grupo)
     AND (NOT p_dizima  OR p.dizima_oferta)
     AND (NOT p_batismo OR p.tem_batismo)
     AND (NOT p_next    OR p.tem_next)
     AND (NOT p_decisao OR p.tem_decisao)
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
