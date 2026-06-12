-- ════════════════════════════════════════════════════════════════════════
-- RH · Escalas de Extra + Config (chave/valor)
-- ════════════════════════════════════════════════════════════════════════
-- A aba "Extras" do módulo RH (TabExtras.jsx) e o api.js já chamavam
-- /rh/extras e /rh/config, mas o backend e as tabelas nunca foram criados
-- (drift git↔prod · só apareciam citados na documentação). Resultado em
-- produção: 404 ("erro de /endpoint") e a aba inteira sem funcionar.
--
-- Esta migration é ADITIVA e IDEMPOTENTE: cria as tabelas se não existirem,
-- garante as colunas (caso já exista um resíduo em prod com shape parcial) e
-- fixa a RLS contextual do módulo RH (sem USING(true), conforme as regras de
-- segurança do projeto). O backend usa service_role e contorna a RLS; as
-- policies aqui são defesa-em-profundidade pra acesso direto via anon key.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. rh_escalas_extras ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rh_escalas_extras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id  UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  data            DATE NOT NULL,
  horario_inicio  TIME,
  horario_fim     TIME,
  valor           NUMERIC(12,2),
  observacoes     TEXT,
  status          TEXT NOT NULL DEFAULT 'agendado',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante as colunas mesmo se a tabela já existir em prod (drift)
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES public.rh_funcionarios(id) ON DELETE CASCADE;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS titulo         TEXT;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS descricao      TEXT;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS data           DATE;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS horario_inicio TIME;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS horario_fim    TIME;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS valor          NUMERIC(12,2);
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS observacoes    TEXT;
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'agendado';
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.rh_escalas_extras ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rh_escalas_extras_func   ON public.rh_escalas_extras(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_rh_escalas_extras_data   ON public.rh_escalas_extras(data DESC);
CREATE INDEX IF NOT EXISTS idx_rh_escalas_extras_status ON public.rh_escalas_extras(status);

ALTER TABLE public.rh_escalas_extras ENABLE ROW LEVEL SECURITY;

-- ── 2. rh_config (chave/valor do módulo) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rh_config (
  chave       TEXT PRIMARY KEY,
  valor       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);
ALTER TABLE public.rh_config ADD COLUMN IF NOT EXISTS valor      TEXT;
ALTER TABLE public.rh_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.rh_config ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE public.rh_config ENABLE ROW LEVEL SECURITY;

-- Semente do valor padrão de extra (não sobrescreve se já existir)
INSERT INTO public.rh_config (chave, valor)
VALUES ('valor_extra_padrao', '150.00')
ON CONFLICT (chave) DO NOTHING;

-- ── 3. RLS · limpa policies antigas (drift) e cria as canônicas ─────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('rh_escalas_extras', 'rh_config')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- rh_escalas_extras · contém funcionario_id + valor (remuneração pontual)
CREATE POLICY rh_escalas_extras_select ON public.rh_escalas_extras
  FOR SELECT TO authenticated
  USING (
    funcionario_id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 1
  );
CREATE POLICY rh_escalas_extras_insert ON public.rh_escalas_extras
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_escalas_extras_update ON public.rh_escalas_extras
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_escalas_extras_delete ON public.rh_escalas_extras
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY rh_escalas_extras_service ON public.rh_escalas_extras
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rh_config · configuração do módulo (não-PII)
CREATE POLICY rh_config_select ON public.rh_config
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('rh') >= 1);
CREATE POLICY rh_config_insert ON public.rh_config
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_config_update ON public.rh_config
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_config_delete ON public.rh_config
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY rh_config_service ON public.rh_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
