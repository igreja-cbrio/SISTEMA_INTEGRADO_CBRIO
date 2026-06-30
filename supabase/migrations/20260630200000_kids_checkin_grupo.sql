-- Check-in multi-culto: criança que "fica direto" em mais de um culto.
-- Uma entrada física (mesmo código/etiqueta/pager) vira N linhas de check-in
-- (uma por culto), agrupadas por checkin_grupo_id. Cada culto conta a presença
-- (a consolidação existente conta por sessao_id, sem mudança); a retirada fecha
-- o grupo inteiro. Aditiva e backwards-compatible.
ALTER TABLE public.kids_checkins ADD COLUMN IF NOT EXISTS checkin_grupo_id uuid;
CREATE INDEX IF NOT EXISTS idx_kids_checkins_grupo
  ON public.kids_checkins (checkin_grupo_id) WHERE checkin_grupo_id IS NOT NULL;
