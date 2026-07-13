-- Solicitações · visibilidade por área (decidida na criação).
-- compartilhar_area=true → colegas da própria área (area_cliente) também veem a
-- solicitação. Default false = privada (assuntos pessoais/RH ficam privados).
-- Aditiva/idempotente · já aplicada em prod via MCP em 2026-07-13.
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS compartilhar_area boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.solicitacoes.compartilhar_area IS
  'Solicitante optou por deixar a solicitação visível pros colegas da própria área (area_cliente). Default false = privada. Decidido na criação.';
