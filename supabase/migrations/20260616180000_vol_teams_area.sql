-- Equipes de voluntariado por ÁREA · permite agrupar/filtrar as equipes
-- (vol_teams) por uma área (ex.: Produção, Kids, Louvor, Acolhimento). Texto
-- livre, definido pela liderança na tela de Equipes. Aditivo e idempotente.
ALTER TABLE public.vol_teams ADD COLUMN IF NOT EXISTS area text;

CREATE INDEX IF NOT EXISTS idx_vol_teams_area
  ON public.vol_teams (area) WHERE area IS NOT NULL;
