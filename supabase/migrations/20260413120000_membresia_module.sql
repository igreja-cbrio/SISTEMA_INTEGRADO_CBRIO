-- Módulo de Membresia
-- Tabelas: mem_familias, mem_membros, mem_trilha_valores, mem_historico

-- 1. mem_familias
CREATE TABLE public.mem_familias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_familias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read mem_familias" ON public.mem_familias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_familias" ON public.mem_familias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_familias" ON public.mem_familias FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_familias" ON public.mem_familias FOR DELETE TO authenticated USING (true);

-- 2. mem_membros
CREATE TABLE public.mem_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cpf TEXT,
  rg TEXT,
  data_nascimento DATE,
  estado_civil TEXT,
  genero TEXT,
  profissao TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  cep TEXT,
  familia_id UUID REFERENCES public.mem_familias(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'visitante',
  ministerio TEXT,
  grupo TEXT,
  data_conversao DATE,
  data_batismo DATE,
  data_membresia DATE,
  foto_url TEXT,
  observacoes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read mem_membros" ON public.mem_membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_membros" ON public.mem_membros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_membros" ON public.mem_membros FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_membros" ON public.mem_membros FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_membros_familia ON public.mem_membros(familia_id);
CREATE INDEX idx_mem_membros_status ON public.mem_membros(status) WHERE active = true;
CREATE INDEX idx_mem_membros_nome ON public.mem_membros(nome) WHERE active = true;

-- 3. mem_trilha_valores
CREATE TABLE public.mem_trilha_valores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  data_conclusao DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(membro_id, etapa)
);
ALTER TABLE public.mem_trilha_valores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read mem_trilha_valores" ON public.mem_trilha_valores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_trilha_valores" ON public.mem_trilha_valores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_trilha_valores" ON public.mem_trilha_valores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_trilha_valores" ON public.mem_trilha_valores FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_trilha_membro ON public.mem_trilha_valores(membro_id);

-- 4. mem_historico
CREATE TABLE public.mem_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  tipo TEXT,
  descricao TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  registrado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read mem_historico" ON public.mem_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_historico" ON public.mem_historico FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_historico" ON public.mem_historico FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_historico" ON public.mem_historico FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_historico_membro ON public.mem_historico(membro_id, data DESC);
