-- Motivo da recusa de escala (2026-07-07)
-- Pedido do Matheus: o voluntário pode aceitar OU recusar a escala; ao recusar,
-- dá pra dizer o porquê (viagem, doente, saiu da igreja, trocou de área, outros)
-- — opcional. Guardamos o motivo pra o líder ver.
ALTER TABLE public.vol_schedules ADD COLUMN IF NOT EXISTS recusa_motivo TEXT;
COMMENT ON COLUMN public.vol_schedules.recusa_motivo IS
  'Motivo (opcional) quando o voluntário recusa a escala pelo app. Limpo ao confirmar.';
