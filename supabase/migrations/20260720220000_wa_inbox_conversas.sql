-- Inbox de WhatsApp (estilo Multi360) · Cuidados → Conversas.
-- Só p/ contatos que NÃO são fluxo do bot (convertidos, visitantes, gente comum).
-- Já aplicada via MCP (aditiva · CREATE ... IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS public.wa_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL UNIQUE,                 -- E.164 (só dígitos)
  nome text,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nao_lidas int NOT NULL DEFAULT 0,
  resolvida boolean NOT NULL DEFAULT false,
  atribuido_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ultima_previa text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,                   -- p/ a janela de 24h do WhatsApp
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_recent ON public.wa_conversas (last_message_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.wa_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  direcao text NOT NULL CHECK (direcao IN ('in','out')),
  tipo text NOT NULL DEFAULT 'text',             -- text|image|audio|template|institucional
  texto text,
  wa_message_id text UNIQUE,                      -- dedup de reentrega do webhook
  autor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_conversa ON public.wa_mensagens (conversa_id, criado_em);

ALTER TABLE public.wa_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mensagens ENABLE ROW LEVEL SECURITY;
-- Acesso pela API (service_role bypassa). Leitura direta só p/ quem tem Cuidados.
CREATE POLICY wa_conversas_sel ON public.wa_conversas FOR SELECT TO authenticated
  USING (public.current_user_module_level('cuidados') >= 1);
CREATE POLICY wa_conversas_srv ON public.wa_conversas FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY wa_mensagens_sel ON public.wa_mensagens FOR SELECT TO authenticated
  USING (public.current_user_module_level('cuidados') >= 1);
CREATE POLICY wa_mensagens_srv ON public.wa_mensagens FOR ALL TO service_role USING (true) WITH CHECK (true);
