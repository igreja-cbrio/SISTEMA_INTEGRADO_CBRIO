-- ============================================================================
-- WhatsApp · fila de envios de template com reenvio automático (2026-07-13)
--
-- Contexto: o limite de envio da Meta é uma janela móvel de 24h por pessoas
-- únicas (portfólio hoje em TIER_250). No pico das inscrições da temporada de
-- grupos, o que passar do teto FALHA na hora — sem fila, a confirmação se
-- perde. A fila guarda cada envio (registro + rastreio por message_id) e o
-- cron horário reenvia com backoff até entregar (plano do Marcos: "estourou
-- o dia, sai no dia seguinte"). O volume que sai daqui também cumpre o
-- requisito da Meta pra subir o limite pra 2.000/dia.
--
-- NOTA (soft-delete): a tabela guarda telefone/params (PII leve) mas é fila
-- operacional — o app nunca deleta (cancelamento = status 'cancelado');
-- DELETE fica só com service_role. Por isso não entra na whitelist
-- app_soft_deletable_tables() (não há fluxo de delete de app a proteger);
-- a coluna deleted_at existe pra uma futura política de retenção.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  template text NOT NULL,
  idioma text NOT NULL DEFAULT 'pt_BR',
  params jsonb NOT NULL DEFAULT '[]'::jsonb,
  contexto text,
  ref_id uuid,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro', 'cancelado')),
  tentativas int NOT NULL DEFAULT 0,
  max_tentativas int NOT NULL DEFAULT 5,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  message_id text,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_fila
  ON public.whatsapp_envios (proxima_tentativa_em) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_ref
  ON public.whatsapp_envios (contexto, ref_id);

ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_envios' AND policyname = 'whatsapp_envios_select'
  ) THEN
    CREATE POLICY whatsapp_envios_select ON public.whatsapp_envios
      FOR SELECT TO authenticated
      USING (
        public.is_super_admin()
        OR public.current_user_module_level('grupos') >= 3
        OR public.current_user_module_level('integracao') >= 3
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_envios' AND policyname = 'whatsapp_envios_service'
  ) THEN
    CREATE POLICY whatsapp_envios_service ON public.whatsapp_envios
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.whatsapp_envios IS
  'Fila de envios de template WhatsApp (registro + reenvio com backoff · cron /api/public/grupos/cron/whatsapp-fila)';
