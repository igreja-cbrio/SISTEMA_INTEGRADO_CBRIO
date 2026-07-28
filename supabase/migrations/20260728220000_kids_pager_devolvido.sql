-- Controle de DEVOLUÇÃO do pager (Mari 2026-07-28): o pai pode retirar a criança
-- (checkout) e levar o pager sem querer. Precisamos saber se voltou, e rastrear
-- qual pager foi de qual criança em qual culto. Aditivo/idempotente.
ALTER TABLE public.kids_checkins
  ADD COLUMN IF NOT EXISTS pager_devolvido_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pager_devolvido_por UUID;

COMMENT ON COLUMN public.kids_checkins.pager_devolvido_at IS
  'Quando o pager físico foi devolvido (distinto do checkout · pai pode sair e levar o pager). NULL + pager_numero + já saiu = pager foi pra casa.';
