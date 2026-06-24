-- Batismo · config do grupo de WhatsApp (2026-06-24)
-- A Lorena (Integração) cria um grupo novo a cada mês e atualiza o link aqui.
-- Quem se inscreve (link externo ou app) vê o link no fim pra entrar no grupo.
CREATE TABLE IF NOT EXISTS public.batismo_config (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  grupo_url   text,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.batismo_config (id, grupo_url)
VALUES (1, 'https://chat.whatsapp.com/BacQTxHmbd50AMqcTR6T2E?mode=gi_t')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.batismo_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batismo_config_select ON public.batismo_config;
CREATE POLICY batismo_config_select ON public.batismo_config
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('integracao') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS batismo_config_update ON public.batismo_config;
CREATE POLICY batismo_config_update ON public.batismo_config
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('integracao') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('integracao') >= 3 OR public.is_super_admin());

DROP POLICY IF EXISTS batismo_config_service ON public.batismo_config;
CREATE POLICY batismo_config_service ON public.batismo_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.batismo_config IS 'Config do batismo · link do grupo de WhatsApp (atualizado pela Integração a cada mês).';
