-- Aprovação de solicitação pelo WhatsApp (2026-07-06)
-- Pedido do Matheus: o aprovador (ex.: Arthur Serpa) recebe a solicitação no
-- WhatsApp e responde 1 (aprovar) / 2 (rejeitar) sem entrar no sistema. Esta
-- fila liga o número do aprovador à solicitação pendente pra correlacionar a
-- resposta. Gerida só pelo backend (service_role).
CREATE TABLE IF NOT EXISTS public.solicitacao_wpp_fila (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  aprovador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  telefone TEXT NOT NULL,               -- normalizado (só dígitos, 55+DDD)
  tipo TEXT NOT NULL DEFAULT 'origem',  -- origem (v1)
  status TEXT NOT NULL DEFAULT 'aguardando', -- aguardando | aprovada | rejeitada | cancelada
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_em TIMESTAMPTZ,
  UNIQUE (solicitacao_id, aprovador_id, tipo)
);
CREATE INDEX IF NOT EXISTS idx_solic_wpp_fila_tel_status
  ON public.solicitacao_wpp_fila (telefone, status);

ALTER TABLE public.solicitacao_wpp_fila ENABLE ROW LEVEL SECURITY;
CREATE POLICY solic_wpp_fila_service ON public.solicitacao_wpp_fila
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY solic_wpp_fila_admin ON public.solicitacao_wpp_fila
  FOR SELECT TO authenticated USING (public.is_super_admin());
