-- ═══════════════════════════════════════════════════════════════════════
-- Módulo Cuidados v1 — rodar no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════════
-- Cria tabelas, view consolidada para KPIs e RLS padrão (authenticated true,
-- backend faz a checagem fina via canCuidados/admin/diretor).

-- 1. Módulo de permissão
INSERT INTO public.modulos (nome, ativo) VALUES ('Cuidados', true)
  ON CONFLICT DO NOTHING;

-- 2. Pessoas em acompanhamento ativo (com nome — vinculadas a mem_membros)
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
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cui_acomp_status ON public.cui_acompanhamentos(status);
CREATE INDEX IF NOT EXISTS idx_cui_acomp_membro ON public.cui_acompanhamentos(membro_id);

-- 3. Atendimentos agregados (sem nomes) — capelania e aconselhamento
CREATE TABLE IF NOT EXISTS public.cui_atendimentos_agregado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes date NOT NULL,
  tipo text NOT NULL,
  quantidade int NOT NULL DEFAULT 0,
  responsavel_id uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cui_agreg_mes_tipo
  ON public.cui_atendimentos_agregado (mes, tipo, COALESCE(responsavel_id::text, ''));

-- 4. Jornada 180 — encontros (com nomes)
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
CREATE INDEX IF NOT EXISTS idx_cui_jornada_data ON public.cui_jornada180(data_encontro DESC);
CREATE INDEX IF NOT EXISTS idx_cui_jornada_membro ON public.cui_jornada180(membro_id);

-- 5. Convertidos pós-culto (semanal)
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
CREATE INDEX IF NOT EXISTS idx_cui_conv_data ON public.cui_convertidos(data_culto DESC);

-- FK para cultos só se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cultos') THEN
    BEGIN
      ALTER TABLE public.cui_convertidos
        ADD CONSTRAINT cui_convertidos_culto_fk
        FOREIGN KEY (culto_id) REFERENCES public.cultos(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 6. View consolidada — alimentada pelos endpoints /api/kpis e /api/cuidados/dashboard
CREATE OR REPLACE VIEW public.vw_cuidados_mensal AS
SELECT
  date_trunc('month', CURRENT_DATE)::date AS mes,
  (SELECT count(*) FROM public.cui_acompanhamentos WHERE status='ativo')::int AS pessoas_acompanhadas,
  (SELECT coalesce(sum(quantidade),0) FROM public.cui_atendimentos_agregado
     WHERE tipo='aconselhamento' AND mes = date_trunc('month', CURRENT_DATE)::date)::int AS aconselhamentos,
  (SELECT coalesce(sum(quantidade),0) FROM public.cui_atendimentos_agregado
     WHERE tipo='capelania' AND mes = date_trunc('month', CURRENT_DATE)::date)::int AS capelania,
  (SELECT count(*) FROM public.cui_jornada180
     WHERE date_trunc('month', data_encontro) = date_trunc('month', CURRENT_DATE))::int AS jornada180_encontros,
  (SELECT count(*) FROM public.cui_convertidos
     WHERE atendido_apos_culto = true
       AND date_trunc('month', data_culto) = date_trunc('month', CURRENT_DATE))::int AS convertidos_atendidos,
  (SELECT count(*) FROM public.cui_convertidos
     WHERE cadastrado = true
       AND date_trunc('month', data_culto) = date_trunc('month', CURRENT_DATE))::int AS convertidos_cadastrados;

-- 7. RLS — padrão authenticated read/write (backend valida canCuidados)
ALTER TABLE public.cui_acompanhamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_atendimentos_agregado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_jornada180            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cui_convertidos           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cui_acompanhamentos','cui_atendimentos_agregado','cui_jornada180','cui_convertidos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read %s"   ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated write %s"  ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated update %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated delete %s" ON public.%I', t, t);

    EXECUTE format('CREATE POLICY "Authenticated read %s"   ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "Authenticated write %s"  ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "Authenticated update %s" ON public.%I FOR UPDATE TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "Authenticated delete %s" ON public.%I FOR DELETE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- Mapear rota /cuidados → módulo "Cuidados" (também referenciado no backend)
-- (apenas informativo — o ROUTE_MODULE_MAP do backend já trata)
