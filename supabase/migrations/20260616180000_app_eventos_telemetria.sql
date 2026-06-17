-- ============================================================
-- Telemetria do app · log de eventos de uso + erros (crash JS)
-- Append-only. Gravado pelo backend (service role) a partir do app;
-- lido no dashboard do sistema (também via service role). Sem acesso
-- anon/authenticated direto.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'acao' CHECK (tipo IN ('tela', 'acao', 'erro')),
  nome text NOT NULL,
  props jsonb,
  plataforma text,            -- ios | android
  app_version text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_eventos_created ON public.app_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_eventos_tipo_nome ON public.app_eventos (tipo, nome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_eventos_user_dia ON public.app_eventos (user_id, created_at);

ALTER TABLE public.app_eventos ENABLE ROW LEVEL SECURITY;

-- Só o backend (service role) escreve/lê. Dashboard do sistema usa service role.
DROP POLICY IF EXISTS app_eventos_service ON public.app_eventos;
CREATE POLICY app_eventos_service ON public.app_eventos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.app_eventos IS
  'Telemetria do app de membros: telas vistas, ações e erros (crash JS). Append-only, sem PII sensível.';

-- Resumo agregado pro dashboard do sistema (1 RPC · evita o cap de 1000 linhas).
CREATE OR REPLACE FUNCTION public.fn_app_telemetria_resumo(p_dias int DEFAULT 14)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT * FROM public.app_eventos
    WHERE created_at >= now() - (p_dias || ' days')::interval
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
