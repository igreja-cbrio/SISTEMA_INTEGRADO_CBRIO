-- Codigo unico por grupo no formato {temporada}-{NNN} (ex: T1-2026-001).
-- Estavel por temporada, sem colisoes, fácil de referenciar/buscar.
--
-- Estrategia:
-- 1. Adiciona coluna mem_grupos.codigo (nullable a principio para o backfill)
-- 2. Backfill dos grupos existentes ordenados por bairro+nome
-- 3. Cria trigger BEFORE INSERT que auto-gera quando codigo eh null
-- 4. UNIQUE index parcial (so onde codigo nao eh null)

ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS codigo text;

COMMENT ON COLUMN public.mem_grupos.codigo IS 'Codigo unico estavel no formato {temporada}-{NNN}, ex T1-2026-047. Auto-gerado se nao informado.';

-- ── Function que gera proximo codigo da temporada ──
CREATE OR REPLACE FUNCTION public.gerar_codigo_grupo(p_temporada text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_max int;
  v_prefix text;
BEGIN
  IF p_temporada IS NULL OR p_temporada = '' THEN
    RETURN NULL;
  END IF;
  v_prefix := p_temporada || '-';

  -- Pega o maior sequencial dos codigos ja gerados nessa temporada
  SELECT COALESCE(MAX(NULLIF(SUBSTRING(codigo FROM '[0-9]+$'), '')::int), 0) INTO v_max
    FROM public.mem_grupos
   WHERE codigo LIKE v_prefix || '%';

  RETURN v_prefix || LPAD((v_max + 1)::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_codigo_grupo(text) TO authenticated, service_role;

-- ── Backfill (antes do UNIQUE index, para evitar conflitos) ──
-- Ordenacao: bairro alfabetico (NULLs por ultimo) + nome alfabetico.
DO $$
DECLARE
  v_temporadas record;
BEGIN
  FOR v_temporadas IN
    SELECT DISTINCT temporada FROM public.mem_grupos
     WHERE temporada IS NOT NULL AND codigo IS NULL
  LOOP
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY bairro NULLS LAST, nome, id) AS rn
        FROM public.mem_grupos
       WHERE temporada = v_temporadas.temporada
         AND codigo IS NULL
    )
    UPDATE public.mem_grupos g
       SET codigo = v_temporadas.temporada || '-' || LPAD(r.rn::text, 3, '0')
      FROM ranked r
     WHERE g.id = r.id;
  END LOOP;
END $$;

-- ── UNIQUE index parcial ──
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_grupos_codigo
  ON public.mem_grupos(codigo)
  WHERE codigo IS NOT NULL;

-- ── Trigger BEFORE INSERT: auto-gera codigo se vazio ──
CREATE OR REPLACE FUNCTION public.trigger_auto_codigo_grupo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.codigo IS NULL OR NEW.codigo = '') AND NEW.temporada IS NOT NULL THEN
    NEW.codigo := public.gerar_codigo_grupo(NEW.temporada);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_codigo_grupo ON public.mem_grupos;
CREATE TRIGGER auto_codigo_grupo
  BEFORE INSERT ON public.mem_grupos
  FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_codigo_grupo();
