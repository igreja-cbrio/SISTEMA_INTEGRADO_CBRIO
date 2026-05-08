-- ============================================================================
-- push_subscriptions: armazena os endpoints Web Push (PushManager subscribe)
-- por usuario. Cada device/browser cria uma subscription distinta — um user
-- pode ter varias linhas (celular + desktop).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (auth_user_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions por usuario; um user pode ter varias (celular, desktop).';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'URL unica do PushManager — usado pelo backend para enviar push via web-push.';
