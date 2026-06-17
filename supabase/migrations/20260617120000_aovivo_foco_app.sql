-- ============================================================
-- Painel Ao Vivo · foco no APP (e não na base total da igreja)
-- - cadastros_app_total: só quem se cadastrou PELO app (origem='app')
-- - cadastros_recentes: só os do app
-- - cadastros_total (sistema) vira métrica secundária
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_app_telemetria_ao_vivo()
RETURNS jsonb LANGUAGE sql STABLE AS $$
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
    -- APP (o que importa no lançamento)
    'cadastros_app_total', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND origem_cadastro = 'app'),
    'cadastros_app_hoje', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND origem_cadastro = 'app' AND created_at >= (SELECT ini FROM hoje)),
    -- Base total da igreja no sistema (secundário)
    'cadastros_total', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL),
    'cadastros_hoje', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND created_at >= (SELECT ini FROM hoje)),
    -- Feed: só cadastros PELO app
    'cadastros_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'em', created_at) ORDER BY created_at DESC), '[]')
                           FROM (SELECT nome, created_at FROM mem_membros
                                 WHERE deleted_at IS NULL AND origem_cadastro = 'app'
                                 ORDER BY created_at DESC LIMIT 15) c)
  )
$$;
