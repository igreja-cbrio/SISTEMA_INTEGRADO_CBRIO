-- Encontros do grupo (chamada / lista de presenca)
-- Substitui o contador opaco mem_grupo_membros.presencas por entidades
-- de reuniao: cada encontro tem data, tema, e marca de presenca por membro.
-- O contador continua sendo atualizado para compatibilidade com a tela atual.

CREATE TABLE IF NOT EXISTS public.mem_grupo_encontros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  tema text,
  observacoes text,
  registrado_por uuid,
  registrado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, data)
);

ALTER TABLE public.mem_grupo_encontros ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read mem_grupo_encontros" ON public.mem_grupo_encontros FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated write mem_grupo_encontros" ON public.mem_grupo_encontros FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated update mem_grupo_encontros" ON public.mem_grupo_encontros FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated delete mem_grupo_encontros" ON public.mem_grupo_encontros FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mem_grupo_encontros_grupo_data
  ON public.mem_grupo_encontros(grupo_id, data DESC);

-- Presencas por encontro
CREATE TABLE IF NOT EXISTS public.mem_grupo_encontro_presencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encontro_id uuid NOT NULL REFERENCES public.mem_grupo_encontros(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  presente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encontro_id, membro_id)
);

ALTER TABLE public.mem_grupo_encontro_presencas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read mem_grupo_encontro_presencas" ON public.mem_grupo_encontro_presencas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated write mem_grupo_encontro_presencas" ON public.mem_grupo_encontro_presencas FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated update mem_grupo_encontro_presencas" ON public.mem_grupo_encontro_presencas FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated delete mem_grupo_encontro_presencas" ON public.mem_grupo_encontro_presencas FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mem_grupo_encontro_presencas_encontro
  ON public.mem_grupo_encontro_presencas(encontro_id);
CREATE INDEX IF NOT EXISTS idx_mem_grupo_encontro_presencas_membro
  ON public.mem_grupo_encontro_presencas(membro_id);

-- RPC atomico: cria encontro + grava presencas + atualiza contador
CREATE OR REPLACE FUNCTION public.registrar_encontro_grupo(
  p_grupo_id uuid,
  p_data date,
  p_tema text,
  p_observacoes text,
  p_registrado_por uuid,
  p_registrado_por_nome text,
  p_membros_presentes uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_encontro_id uuid;
  v_membro_id uuid;
BEGIN
  INSERT INTO public.mem_grupo_encontros
    (grupo_id, data, tema, observacoes, registrado_por, registrado_por_nome)
  VALUES (p_grupo_id, p_data, p_tema, p_observacoes, p_registrado_por, p_registrado_por_nome)
  RETURNING id INTO v_encontro_id;

  IF p_membros_presentes IS NOT NULL THEN
    FOREACH v_membro_id IN ARRAY p_membros_presentes LOOP
      INSERT INTO public.mem_grupo_encontro_presencas (encontro_id, membro_id, presente)
      VALUES (v_encontro_id, v_membro_id, true);

      UPDATE public.mem_grupo_membros
         SET presencas = COALESCE(presencas, 0) + 1
       WHERE grupo_id = p_grupo_id AND membro_id = v_membro_id AND saiu_em IS NULL;
    END LOOP;
  END IF;

  RETURN v_encontro_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_encontro_grupo(uuid, date, text, text, uuid, text, uuid[])
  TO authenticated, service_role;

-- RPC para decremento (usado quando um encontro e removido)
CREATE OR REPLACE FUNCTION public.decrementar_presenca_grupo_membro(
  p_grupo_id uuid,
  p_membro_id uuid
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.mem_grupo_membros
     SET presencas = GREATEST(COALESCE(presencas, 0) - 1, 0)
   WHERE grupo_id = p_grupo_id AND membro_id = p_membro_id AND saiu_em IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.decrementar_presenca_grupo_membro(uuid, uuid)
  TO authenticated, service_role;
