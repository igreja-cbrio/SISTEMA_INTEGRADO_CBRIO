-- ============================================================
-- Convite do NEXT · config do modelo de mensagem + link de inscrição
-- ============================================================
-- Singleton editável (sem PII). O disparo em massa usa template aprovado da
-- Meta (env WHATSAPP_TEMPLATE_NEXT_CONVITE); este modelo serve de referência,
-- pré-visualização e pro link de inscrição enviado às pessoas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.next_convite_config (
  id int PRIMARY KEY DEFAULT 1,
  mensagem_modelo text,
  link_inscricao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT next_convite_config_singleton CHECK (id = 1)
);

INSERT INTO public.next_convite_config (id, mensagem_modelo, link_inscricao)
VALUES (
  1,
  'Oi, {nome}! 💙 Que alegria ter você com a gente! O NEXT é o nosso encontro para quem está começando a caminhada na CBRio — um passo importante pra você conhecer mais e se conectar. Faça sua inscrição aqui: {link}',
  'https://cbrio.org/next'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.next_convite_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS next_convite_config_select ON public.next_convite_config;
CREATE POLICY next_convite_config_select ON public.next_convite_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS next_convite_config_service ON public.next_convite_config;
CREATE POLICY next_convite_config_service ON public.next_convite_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.next_convite_config IS
  'Config (singleton) do convite do NEXT: modelo de mensagem ({nome}/{link}) + link de inscrição. Escrita via backend (service_role).';
