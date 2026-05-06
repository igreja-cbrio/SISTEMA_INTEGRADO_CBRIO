-- Adiciona suporte a bairro, status_temporada e temporada nos grupos.
-- A cada semestre, a temporada vira (T1-2026, T2-2026, ...) e os grupos
-- recebem temporada igual a corrente.

-- ── Colunas em mem_grupos ──
ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS status_temporada text,
  ADD COLUMN IF NOT EXISTS temporada text;

CREATE INDEX IF NOT EXISTS idx_mem_grupos_bairro ON public.mem_grupos(bairro) WHERE bairro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupos_temporada ON public.mem_grupos(temporada) WHERE temporada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupos_status_temporada ON public.mem_grupos(status_temporada) WHERE status_temporada IS NOT NULL;

COMMENT ON COLUMN public.mem_grupos.status_temporada IS 'ativo | novo | aguardando | a_confirmar | encerrado';
COMMENT ON COLUMN public.mem_grupos.temporada IS 'Codigo da temporada (T1-YYYY, T2-YYYY)';
COMMENT ON COLUMN public.mem_grupos.bairro IS 'Bairro logico (Online/Presencial sao validos como bairro)';

-- ── Tabela mem_temporadas ──
-- Lista de temporadas (T1-2026, T2-2026, ...) com label e periodo.
-- A temporada "ativa" e a vigente — usada como default na UI.
CREATE TABLE IF NOT EXISTS public.mem_temporadas (
  id text PRIMARY KEY, -- 'T1-2026'
  label text NOT NULL, -- 'Primeira Temporada 2026'
  ano smallint NOT NULL,
  numero smallint NOT NULL CHECK (numero IN (1, 2)),
  data_inicio date,
  data_fim date,
  ativa boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mem_temporadas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read mem_temporadas" ON public.mem_temporadas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated write mem_temporadas" ON public.mem_temporadas FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated update mem_temporadas" ON public.mem_temporadas FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated delete mem_temporadas" ON public.mem_temporadas FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Garantir apenas uma temporada ativa por vez
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_temporadas_ativa
  ON public.mem_temporadas((1)) WHERE ativa = true;

-- Seed das temporadas conhecidas (T1-2026 ativa, T2-2026 prevista)
INSERT INTO public.mem_temporadas (id, label, ano, numero, data_inicio, data_fim, ativa)
VALUES
  ('T1-2026', 'Primeira Temporada 2026', 2026, 1, '2026-02-01', '2026-07-31', true),
  ('T2-2026', 'Segunda Temporada 2026',  2026, 2, '2026-08-01', '2026-12-31', false)
ON CONFLICT (id) DO NOTHING;
