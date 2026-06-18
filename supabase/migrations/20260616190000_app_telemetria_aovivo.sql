-- ============================================================
-- Telemetria · painel AO VIVO (lançamento) + heartbeat
-- - novo tipo 'ping' (heartbeat de presença · não conta nas analytics)
-- - RPC ao vivo: online agora, cadastros ao vivo, telas em uso, feed
-- ============================================================

-- 1. Permite o tipo 'ping' (heartbeat)
ALTER TABLE public.app_eventos DROP CONSTRAINT IF EXISTS app_eventos_tipo_check;
ALTER TABLE public.app_eventos
  ADD CONSTRAINT app_eventos_tipo_check CHECK (tipo IN ('tela', 'acao', 'erro', 'ping'));

-- 2. Resumo (histórico) · exclui 'ping' das analytics
CREATE OR REPLACE FUNCTION public.fn_app_telemetria_resumo(p_dias int DEFAULT 14)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT * FROM public.app_eventos
    WHERE created_at >= now() - (p_dias || ' days')::interval AND tipo <> 'ping'
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'usuarios', (SELECT count(DISTINCT user_id) FROM base WHERE user_id IS NOT NULL),
    'por_dia', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'eventos', n, 'usuarios', u) ORDER BY dia), '[]')
                FROM (SELECT date_trunc('day', created_at)::date AS dia, count(*) n, count(DISTINCT user_id) u
                      FROM base GROUP BY 1) d),
    'top_telas', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'n', n) ORDER BY n DESC), '[]')
                  FROM (SELECT nome, count(*) n FROM base WHERE tipo='tela' GROUP BY 1 ORDER BY n DESC LIMIT 15) t),
    'top_acoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'n', n) ORDER BY n DESC), '[]')
                  FROM (SELECT nome, count(*) n FROM base WHERE tipo='acao' GROUP BY 1 ORDER BY n DESC LIMIT 15) a),
    'por_plataforma', (SELECT coalesce(jsonb_object_agg(coalesce(plataforma,'?'), n), '{}'::jsonb)
                       FROM (SELECT plataforma, count(*) n FROM base GROUP BY 1) p),
    'por_versao', (SELECT coalesce(jsonb_object_agg(coalesce(app_version,'?'), n), '{}'::jsonb)
                   FROM (SELECT app_version, count(*) n FROM base GROUP BY 1) v),
    'erros', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'props', props, 'plataforma', plataforma, 'app_version', app_version, 'em', created_at) ORDER BY created_at DESC), '[]')
              FROM (SELECT * FROM base WHERE tipo='erro' ORDER BY created_at DESC LIMIT 50) e)
  )
$$;

-- 3. Painel AO VIVO
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
    'cadastros_total', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL),
    'cadastros_hoje', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND created_at >= (SELECT ini FROM hoje)),
    'cadastros_app_hoje', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND origem_cadastro='app' AND created_at >= (SELECT ini FROM hoje)),
    'cadastros_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'em', created_at, 'origem', origem_cadastro) ORDER BY created_at DESC), '[]')
                           FROM (SELECT nome, created_at, origem_cadastro FROM mem_membros WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 12) c)
  )
$$;
