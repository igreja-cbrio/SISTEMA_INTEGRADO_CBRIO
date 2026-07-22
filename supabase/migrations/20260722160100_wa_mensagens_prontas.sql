-- Conversas (inbox WhatsApp): mensagens prontas / respostas rápidas reutilizáveis.
-- Sem PII (são modelos de texto da equipe). RLS service-only · acesso via backend
-- atrás da permissão do módulo conversas.
CREATE TABLE IF NOT EXISTS public.wa_mensagens_prontas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     text NOT NULL,
  texto      text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_mensagens_prontas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_mensagens_prontas_service ON public.wa_mensagens_prontas;
CREATE POLICY wa_mensagens_prontas_service ON public.wa_mensagens_prontas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.wa_mensagens_prontas IS 'Mensagens prontas do inbox de WhatsApp (/conversas). RLS service-only · acesso via backend.';
