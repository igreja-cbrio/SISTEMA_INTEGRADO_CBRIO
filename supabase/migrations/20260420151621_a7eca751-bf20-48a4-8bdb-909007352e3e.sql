-- ============================================================
-- Módulo Cuidados — schema completo + cui_atendimentos (timeline)
-- ============================================================

-- 0. Registrar módulo
INSERT INTO public.modulos (nome, ativo)
SELECT 'Cuidados', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE nome = 'Cuidados');

-- ============================================================
-- 1. cui_acompanhamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cui_acompanhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  telefone text,
  responsavel_id uuid REFERENCES auth.users(id),
  motivo text,
  status text NOT NULL DEFAULT 'ativo',
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_encerramento date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cui_acomp_status ON public.cui_acompanhamentos(status);
CREATE INDEX IF NOT EXISTS idx_cui_acomp_membro ON public.cui_acompanhamentos(membro_id);
CREATE INDEX IF NOT EXISTS idx_cui_acomp_resp   ON public.cui_acompanhamentos(responsavel_id);

-- ============================================================
-- 2. cui_atendimentos_agregado
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cui_atendimentos_agregado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes date NOT NULL,
  tipo text NOT NULL,
  quantidade int NOT NULL DEFAULT 0,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mes, tipo, responsavel_id)
);
CREATE INDEX IF NOT EXISTS idx_cui_agreg_mes_tipo ON public.cui_atendimentos_agregado(mes, tipo);

-- ============================================================
-- 3. cui_jornada180
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cui_jornada180 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  etapa int NOT NULL DEFAULT 1,
  data_encontro date NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cui_jor_data   ON public.cui_jornada180(data_encontro);
CREATE INDEX IF NOT EXISTS idx_cui_jor_membro ON public.cui_jornada180(membro_id);

-- ============================================================
-- 4. cui_convertidos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cui_convertidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id uuid,
  data_culto date NOT NULL,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  telefone text,
  atendido_apos_culto boolean NOT NULL DEFAULT false,
  cadastrado boolean NOT NULL DEFAULT false,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cui_conv_data   ON public.cui_convertidos(data_culto);
CREATE INDEX IF NOT EXISTS idx_cui_conv_membro ON public.cui_convertidos(membro_id);

-- ============================================================
-- 5. cui_atendimentos (NOVA — timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cui_atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id uuid NOT NULL REFERENCES public.cui_acompanhamentos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'contato',
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text,
  responsavel_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cui_atend_acomp ON public.cui_atendimentos(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_cui_atend_data  ON public.cui_atendimentos(data DESC);

-- ============================================================
-- 6. View consolidada
-- ============================================================
CREATE OR REPLACE VIEW public.vw_cuidados_mensal AS
SELECT
  date_trunc('month', CURRENT_DATE)::date AS mes,
  (SELECT count(*) FROM public.cui_acompanhamentos WHERE status='ativo') AS pessoas_acompanhadas,
  (SELECT coalesce(sum(quantidade),0) FROM public.cui_atendimentos_agregado
     WHERE tipo='aconselhamento' AND mes = date_trunc('month', CURRENT_DATE)::date) AS aconselhamentos,
  (SELECT coalesce(sum(quantidade),0) FROM public.cui_atendimentos_agregado
     WHERE tipo='capelania' AND mes = date_trunc('month', CURRENT_DATE)::date) AS capelania,
  (SELECT count(*) FROM public.cui_jornada180
     WHERE date_trunc('month', data_encontro) = date_trunc('month', CURRENT_DATE)) AS jornada180_encontros,
  (SELECT count(*) FROM public.cui_convertidos
     WHERE atendido_apos_culto = true
       AND date_trunc('month', data_culto) = date_trunc('month', CURRENT_DATE)) AS convertidos_atendidos,
  (SELECT count(*) FROM public.cui_convertidos
     WHERE cadastrado = true
       AND date_trunc('month', data_culto) = date_trunc('month', CURRENT_DATE)) AS convertidos_cadastrados;

-- ============================================================
-- 7. RLS
-- ============================================================
ALTER TABLE public.cui_acompanhamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_atendimentos_agregado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_jornada180            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_convertidos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_atendimentos          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cui_acompanhamentos','cui_atendimentos_agregado','cui_jornada180','cui_convertidos','cui_atendimentos'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON public.%1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete" ON public.%1$s;', t);

    EXECUTE format('CREATE POLICY "%1$s_select" ON public.%1$s FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('CREATE POLICY "%1$s_insert" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "%1$s_update" ON public.%1$s FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "%1$s_delete" ON public.%1$s FOR DELETE TO authenticated USING (true);', t);
  END LOOP;
END $$;