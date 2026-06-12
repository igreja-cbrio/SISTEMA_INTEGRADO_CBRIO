-- ===========================================================================
-- Devocional · auth de membro via magic link
--
-- Adiciona link profile <-> mem_membros e flag is_membro_only.
-- Membro logado pelo /devocional fica restrito a /devocional/* no frontend.
-- Backend nao restringe sozinho — basta o profile nao ter role com permissao.
-- ===========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membro_id uuid REFERENCES public.mem_membros(id),
  ADD COLUMN IF NOT EXISTS is_membro_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_membro_id
  ON public.profiles(membro_id) WHERE membro_id IS NOT NULL;

-- Backfill · linka profiles existentes que batem com mem_membros pelo email
UPDATE public.profiles p
   SET membro_id = m.id
  FROM public.mem_membros m
 WHERE p.membro_id IS NULL
   AND m.active = true
   AND lower(p.email) = lower(m.email);
