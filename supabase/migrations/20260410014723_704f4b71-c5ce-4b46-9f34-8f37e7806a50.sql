
-- 1. profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'assistente',
  area TEXT,
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update profiles" ON public.profiles FOR UPDATE TO authenticated USING (true);

-- Trigger: criar perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. setores
CREATE TABLE public.setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read setores" ON public.setores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write setores" ON public.setores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update setores" ON public.setores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete setores" ON public.setores FOR DELETE TO authenticated USING (true);

-- 3. areas
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  setor_id UUID REFERENCES public.setores(id),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read areas" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write areas" ON public.areas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update areas" ON public.areas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete areas" ON public.areas FOR DELETE TO authenticated USING (true);

-- 4. cargos
CREATE TABLE public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nivel_padrao_leitura INTEGER NOT NULL DEFAULT 1,
  nivel_padrao_escrita INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read cargos" ON public.cargos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cargos" ON public.cargos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update cargos" ON public.cargos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete cargos" ON public.cargos FOR DELETE TO authenticated USING (true);

-- 5. modulos
CREATE TABLE public.modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read modulos" ON public.modulos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write modulos" ON public.modulos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update modulos" ON public.modulos FOR UPDATE TO authenticated USING (true);

-- Seed módulos
INSERT INTO public.modulos (nome) VALUES
  ('DP'), ('Pessoas'), ('Financeiro'), ('Logística'), ('Patrimônio'),
  ('Membresia'), ('TI'), ('Agenda'), ('Projetos'), ('IA / Agentes'),
  ('Tarefas'), ('Comunicação');

-- 6. usuarios
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  cargo_id UUID REFERENCES public.cargos(id),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read usuarios" ON public.usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write usuarios" ON public.usuarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update usuarios" ON public.usuarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete usuarios" ON public.usuarios FOR DELETE TO authenticated USING (true);

-- 7. permissoes_modulo
CREATE TABLE public.permissoes_modulo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  modulo_id UUID NOT NULL REFERENCES public.modulos(id) ON DELETE CASCADE,
  nivel_leitura INTEGER NOT NULL DEFAULT 1,
  nivel_escrita INTEGER NOT NULL DEFAULT 1,
  UNIQUE(usuario_id, modulo_id)
);
ALTER TABLE public.permissoes_modulo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read permissoes_modulo" ON public.permissoes_modulo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write permissoes_modulo" ON public.permissoes_modulo FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update permissoes_modulo" ON public.permissoes_modulo FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete permissoes_modulo" ON public.permissoes_modulo FOR DELETE TO authenticated USING (true);

-- 8. usuario_areas
CREATE TABLE public.usuario_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  is_principal BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(usuario_id, area_id)
);
ALTER TABLE public.usuario_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read usuario_areas" ON public.usuario_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write usuario_areas" ON public.usuario_areas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update usuario_areas" ON public.usuario_areas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete usuario_areas" ON public.usuario_areas FOR DELETE TO authenticated USING (true);

-- 9. rh_funcionarios
CREATE TABLE public.rh_funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  cargo TEXT,
  area TEXT,
  tipo_contrato TEXT DEFAULT 'CLT',
  data_admissao DATE,
  data_demissao DATE,
  salario NUMERIC,
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rh_funcionarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rh_funcionarios" ON public.rh_funcionarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write rh_funcionarios" ON public.rh_funcionarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rh_funcionarios" ON public.rh_funcionarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete rh_funcionarios" ON public.rh_funcionarios FOR DELETE TO authenticated USING (true);

-- 10. rh_documentos
CREATE TABLE public.rh_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rh_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rh_documentos" ON public.rh_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write rh_documentos" ON public.rh_documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rh_documentos" ON public.rh_documentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete rh_documentos" ON public.rh_documentos FOR DELETE TO authenticated USING (true);

-- 11. rh_treinamentos
CREATE TABLE public.rh_treinamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_inicio DATE,
  data_fim DATE,
  carga_horaria NUMERIC,
  status TEXT NOT NULL DEFAULT 'planejado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rh_treinamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rh_treinamentos" ON public.rh_treinamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write rh_treinamentos" ON public.rh_treinamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rh_treinamentos" ON public.rh_treinamentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete rh_treinamentos" ON public.rh_treinamentos FOR DELETE TO authenticated USING (true);

-- 12. rh_treinamentos_funcionarios
CREATE TABLE public.rh_treinamentos_funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treinamento_id UUID NOT NULL REFERENCES public.rh_treinamentos(id) ON DELETE CASCADE,
  funcionario_id UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inscrito',
  nota NUMERIC,
  UNIQUE(treinamento_id, funcionario_id)
);
ALTER TABLE public.rh_treinamentos_funcionarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rh_treinamentos_func" ON public.rh_treinamentos_funcionarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write rh_treinamentos_func" ON public.rh_treinamentos_funcionarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rh_treinamentos_func" ON public.rh_treinamentos_funcionarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete rh_treinamentos_func" ON public.rh_treinamentos_funcionarios FOR DELETE TO authenticated USING (true);

-- 13. rh_ferias_licencas
CREATE TABLE public.rh_ferias_licencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'ferias',
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rh_ferias_licencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read rh_ferias_licencas" ON public.rh_ferias_licencas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write rh_ferias_licencas" ON public.rh_ferias_licencas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rh_ferias_licencas" ON public.rh_ferias_licencas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete rh_ferias_licencas" ON public.rh_ferias_licencas FOR DELETE TO authenticated USING (true);
