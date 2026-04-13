
-- mem_familias
CREATE TABLE public.mem_familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_familias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_familias" ON public.mem_familias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_familias" ON public.mem_familias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_familias" ON public.mem_familias FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_familias" ON public.mem_familias FOR DELETE TO authenticated USING (true);

-- mem_membros
CREATE TABLE public.mem_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  data_nascimento date,
  estado_civil text,
  endereco text,
  bairro text,
  cidade text,
  cep text,
  profissao text,
  ministerio text,
  grupo text,
  status text NOT NULL DEFAULT 'visitante',
  familia_id uuid REFERENCES public.mem_familias(id),
  foto_url text,
  observacoes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_membros" ON public.mem_membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_membros" ON public.mem_membros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_membros" ON public.mem_membros FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_membros" ON public.mem_membros FOR DELETE TO authenticated USING (true);

-- mem_trilha_valores
CREATE TABLE public.mem_trilha_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  data_conclusao date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_trilha_valores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_trilha_valores" ON public.mem_trilha_valores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_trilha_valores" ON public.mem_trilha_valores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_trilha_valores" ON public.mem_trilha_valores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_trilha_valores" ON public.mem_trilha_valores FOR DELETE TO authenticated USING (true);

-- mem_historico
CREATE TABLE public.mem_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_historico" ON public.mem_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_historico" ON public.mem_historico FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_historico" ON public.mem_historico FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_historico" ON public.mem_historico FOR DELETE TO authenticated USING (true);
