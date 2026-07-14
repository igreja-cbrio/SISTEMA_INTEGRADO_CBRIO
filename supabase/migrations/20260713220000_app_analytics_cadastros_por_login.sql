-- Analytics do App · "Cadastros pelo app" = contas criadas PELO app (login de
-- membro = profiles.is_membro_only), não mem_membros.origem_cadastro='app'
-- (que só pegava quem não tinha membro antes; quem criou login e casou com um
-- membro importado ficava de fora). Já aplicada em prod via MCP (2026-07-13).
CREATE OR REPLACE FUNCTION public.fn_app_telemetria_ao_vivo()
 RETURNS jsonb LANGUAGE sql STABLE AS $function$
  WITH hoje AS (
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS ini
  )
  SELECT jsonb_build_object(
    'online_5min', (SELECT count(DISTINCT user_id) FROM app_eventos WHERE user_id IS NOT NULL AND created_at >= now() - interval '5 minutes'),
    'online_1min', (SELECT count(DISTINCT user_id) FROM app_eventos WHERE user_id IS NOT NULL AND created_at >= now() - interval '1 minute'),
    'eventos_5min', (SELECT count(*) FROM app_eventos WHERE tipo <> 'ping' AND created_at >= now() - interval '5 minutes'),
    'telas_agora', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'n', n) ORDER BY n DESC), '[]')
                    FROM (SELECT nome, count(DISTINCT user_id) n FROM app_eventos
                          WHERE tipo='tela' AND created_at >= now() - interval '5 minutes'
                          GROUP BY nome ORDER BY n DESC LIMIT 8) t),
    'eventos_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'nome', nome, 'plataforma', plataforma, 'em', created_at) ORDER BY created_at DESC), '[]')
                         FROM (SELECT tipo, nome, plataforma, created_at FROM app_eventos WHERE tipo <> 'ping' ORDER BY created_at DESC LIMIT 15) e),
    'cadastros_app_total', (SELECT count(*) FROM profiles WHERE is_membro_only = true),
    'cadastros_app_hoje', (SELECT count(*) FROM profiles WHERE is_membro_only = true AND created_at >= (SELECT ini FROM hoje)),
    'cadastros_total', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL),
    'cadastros_hoje', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND created_at >= (SELECT ini FROM hoje)),
    'cadastros_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'em', em) ORDER BY em DESC), '[]')
                           FROM (SELECT coalesce(m.nome, p.name) AS nome, p.created_at AS em
                                 FROM profiles p LEFT JOIN mem_membros m ON m.id = p.membro_id
                                 WHERE p.is_membro_only = true
                                 ORDER BY p.created_at DESC LIMIT 15) c)
  )
$function$;
