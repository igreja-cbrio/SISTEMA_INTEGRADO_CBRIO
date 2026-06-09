-- =====================================================================
-- Mensagens automáticas de WhatsApp por contexto (2026-06-09)
-- =====================================================================
-- Mecanismo genérico pra enviar uma mensagem de WhatsApp quando uma ação
-- acontece, com TEXTO EDITÁVEL por contexto (chave). Casos iniciais:
--   • voluntariado_inscricao   → alguém se inscreve pra servir (app/form)
--   • cuidados_aconselhamento  → alguém pede aconselhamento pastoral (app)
--
-- Envio DESLIGADO por padrão (ativo=false) — só dispara depois que a equipe
-- escrever a mensagem e ligar. Cada contexto tem sua própria configuração e
-- pode ser editado pelo respectivo módulo (voluntariado / cuidados).
--
-- ⚠️ WhatsApp Business: mensagem proativa (fora da janela de 24h) exige um
-- TEMPLATE aprovado na Meta. Dois modos:
--   modo='template' → template aprovado (recomendado). Params do corpo:
--                     {{1}}=primeiro nome, {{2}}=mensagem (quando usa_nome=true);
--                     ou só {{1}}=mensagem (quando usa_nome=false). Defina template_nome.
--   modo='texto'    → texto livre; só entrega dentro da janela de 24h. Bom p/ teste.
-- ADITIVA · idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_auto_config (
  chave         text PRIMARY KEY,
  titulo        text NOT NULL,
  descricao     text,
  ativo         boolean NOT NULL DEFAULT false,
  modo          text NOT NULL DEFAULT 'template' CHECK (modo IN ('template','texto')),
  template_nome text,
  idioma        text NOT NULL DEFAULT 'pt_BR',
  usa_nome      boolean NOT NULL DEFAULT true,
  mensagem      text NOT NULL DEFAULT '',
  updated_at    timestamptz DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.whatsapp_auto_config (chave, titulo, descricao, mensagem) VALUES
  ('voluntariado_inscricao', 'Boas-vindas ao voluntário',
   'Enviada quando alguém se inscreve pra servir (pelo app ou pelo formulário).',
   'Olá {nome}! Que alegria ter você no time de voluntários da CBRio. 🙌 Em breve nossa equipe entra em contato pra te ajudar nos próximos passos. Deus abençoe!'),
  ('cuidados_aconselhamento', 'Pedido de aconselhamento pastoral',
   'Enviada quando um membro pede aconselhamento pastoral ("Quero conversar com um pastor") pelo app.',
   'Olá {nome}! Recebemos seu pedido pra conversar com um pastor. 🙏 Em breve alguém da nossa equipe pastoral vai falar com você com todo o cuidado. Você não está sozinho(a)!')
ON CONFLICT (chave) DO NOTHING;

-- Log de envios (visibilidade pra equipe conferir que está chegando)
CREATE TABLE IF NOT EXISTS public.whatsapp_auto_envios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave        text NOT NULL,
  ref_id       uuid,            -- id da inscrição/pedido de origem (quando houver)
  telefone     text,
  nome         text,
  origem       text,            -- app | formulario_publico | manual | teste
  status       text NOT NULL DEFAULT 'enviado'
                 CHECK (status IN ('enviado','erro','sem_telefone','desabilitado')),
  message_id   text,
  erro         text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wpp_auto_envios_recentes ON public.whatsapp_auto_envios (chave, created_at DESC);
-- idempotência: 1 envio automático por (contexto, origem-id) · manual/teste ficam com ref_id NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_wpp_auto_envios_ref
  ON public.whatsapp_auto_envios (chave, ref_id) WHERE ref_id IS NOT NULL;

-- RLS · leitura p/ quem atua em voluntariado OU cuidados; escrita só backend
ALTER TABLE public.whatsapp_auto_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_auto_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpp_auto_config_select ON public.whatsapp_auto_config;
CREATE POLICY wpp_auto_config_select ON public.whatsapp_auto_config FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1
      OR public.current_user_module_level('cuidados') >= 1
      OR public.is_super_admin());
DROP POLICY IF EXISTS wpp_auto_config_service ON public.whatsapp_auto_config;
CREATE POLICY wpp_auto_config_service ON public.whatsapp_auto_config FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wpp_auto_envios_select ON public.whatsapp_auto_envios;
CREATE POLICY wpp_auto_envios_select ON public.whatsapp_auto_envios FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1
      OR public.current_user_module_level('cuidados') >= 1
      OR public.is_super_admin());
DROP POLICY IF EXISTS wpp_auto_envios_service ON public.whatsapp_auto_envios;
CREATE POLICY wpp_auto_envios_service ON public.whatsapp_auto_envios FOR ALL TO service_role USING (true) WITH CHECK (true);