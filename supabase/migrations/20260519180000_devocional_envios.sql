-- ===========================================================================
-- Devocional · log de envios via WhatsApp
--
-- Rastreia 1 linha por (item, membro) com status do envio. Garante
-- idempotencia (cron pode rodar 2x sem duplicar) e permite dashboard
-- de envios no admin.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.devocional_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.devocional_itens(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.devocional_planos(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  telefone text,
  canal text NOT NULL DEFAULT 'whatsapp',
  enviado boolean NOT NULL DEFAULT false,
  message_id text,
  motivo text,
  tentativas int NOT NULL DEFAULT 1,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, membro_id)
);

ALTER TABLE public.devocional_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_devocional_envios" ON public.devocional_envios FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_devocional_envios" ON public.devocional_envios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_devocional_envios_plano_item
  ON public.devocional_envios(plano_id, item_id);
CREATE INDEX IF NOT EXISTS idx_devocional_envios_membro
  ON public.devocional_envios(membro_id, created_at DESC);
