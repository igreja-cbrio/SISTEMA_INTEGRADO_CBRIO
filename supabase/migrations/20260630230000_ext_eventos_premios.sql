-- Eventos Externos: lista de prêmios do sorteio (um evento pode sortear vários
-- prêmios). Array de strings (nome de cada prêmio). Cada prêmio recebe um
-- ganhador em ext_sorteios (por `premio`). Aditiva e backwards-compatible.
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS premios jsonb NOT NULL DEFAULT '[]'::jsonb;
