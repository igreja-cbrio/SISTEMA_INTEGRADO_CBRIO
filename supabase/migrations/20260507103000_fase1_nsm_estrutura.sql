-- ============================================================================
-- FASE 1 · Estrutura de NSM (North Star Metric)
--
-- NSM CBRio 2026: "Novos convertidos engajados em pelo menos um dos valores
-- da CBRio em ate 60 dias da decisao."
--
-- ARQUITETURA EM DUAS TABELAS:
--
--   nsm_eventos       - append-only, registra cada engajamento de pessoa
--                       em algum dos 5 valores. Triggers nas tabelas de
--                       origem (batismo, devocional, grupo, voluntariado,
--                       doacao) inserem aqui.
--
--   nsm_estado        - 1 linha por SEGMENTO (central, cbrio, online, cba,
--                       e futuras areas/segmentos). Recalculada por job
--                       horario (`recalcular_nsm()`). Painel le 1 linha,
--                       abre instantaneo.
--
-- 5 VALORES = constants no codigo:
--   seguir       (batismo, primeira presenca pos-decisao)
--   conectar     (entrada em grupo)
--   investir     (registro de devocional)
--   servir       (cadastro/check-in voluntariado)
--   generosidade (primeira doacao)
--
-- ENGAJAMENTO = qualquer evento entre 5 valores conta como 1 engajamento.
-- "Em ate 60 dias" = data_engajamento - data_decisao <= 60.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela: nsm_eventos (append-only, 1 linha por evento)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nsm_eventos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id            uuid REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  visitante_id         uuid REFERENCES public.int_visitantes(id) ON DELETE CASCADE,
  cpf                  text,
  nome                 text,
  igreja_id            uuid REFERENCES public.igrejas(id) ON DELETE SET NULL,

  data_decisao         date NOT NULL,
  valor_engajado       text NOT NULL CHECK (valor_engajado IN ('seguir', 'conectar', 'investir', 'servir', 'generosidade')),
  data_engajamento     date NOT NULL,
  dias_da_decisao      int GENERATED ALWAYS AS ((data_engajamento - data_decisao)) STORED,
  dentro_janela_60d    boolean GENERATED ALWAYS AS ((data_engajamento - data_decisao) <= 60) STORED,

  origem               text NOT NULL,
  origem_id            uuid,
  observacao           text,

  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_pessoa_identificada CHECK (membro_id IS NOT NULL OR visitante_id IS NOT NULL OR cpf IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_nsm_eventos_pessoa_data ON public.nsm_eventos (membro_id, data_decisao);
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_visitante  ON public.nsm_eventos (visitante_id);
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_cpf       ON public.nsm_eventos (cpf);
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_igreja    ON public.nsm_eventos (igreja_id);
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_janela    ON public.nsm_eventos (dentro_janela_60d) WHERE dentro_janela_60d = true;
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_origem    ON public.nsm_eventos (origem, origem_id);

ALTER TABLE public.nsm_eventos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "nsm_eventos_read_authenticated" ON public.nsm_eventos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "nsm_eventos_insert_authenticated" ON public.nsm_eventos FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Tabela: nsm_estado (1 linha por segmento, recalculada periodicamente)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nsm_estado (
  segmento                  text PRIMARY KEY,
  segmento_label            text NOT NULL,
  segmento_tipo             text NOT NULL CHECK (segmento_tipo IN ('central', 'igreja_tipo', 'igreja_id', 'area', 'custom')),
  segmento_filtro           jsonb,

  total_convertidos_periodo int NOT NULL DEFAULT 0,
  engajados_em_60d          int NOT NULL DEFAULT 0,
  percentual                numeric(5,2) NOT NULL DEFAULT 0,
  meta_percentual           numeric(5,2) NOT NULL DEFAULT 50.00,

  delta_vs_mes_anterior     numeric(5,2),
  total_periodo_anterior    int,

  por_valor                 jsonb,

  janela_inicio             date,
  janela_fim                date,
  ativo                     boolean NOT NULL DEFAULT true,
  atualizado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nsm_estado_ativo ON public.nsm_estado (ativo) WHERE ativo = true;

ALTER TABLE public.nsm_estado ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "nsm_estado_read_authenticated" ON public.nsm_estado FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "nsm_estado_write_admin" ON public.nsm_estado FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Seed: segmentos default (central + 3 segmentos por igreja_tipo)
-- ----------------------------------------------------------------------------
INSERT INTO public.nsm_estado (segmento, segmento_label, segmento_tipo, segmento_filtro, meta_percentual, ativo)
VALUES
  ('central', 'CBRio Total',  'central',     '{}'::jsonb,                                                50.00, true),
  ('cbrio',   'CBRio Sede',   'igreja_tipo', '{"tipo": "sede"}'::jsonb,                                  50.00, true),
  ('online',  'CBRio Online', 'igreja_tipo', '{"tipo": "online"}'::jsonb,                                50.00, true),
  ('cba',     'CBA (Rede)',   'igreja_tipo', '{"tipo": "cba_acompanhada"}'::jsonb,                       40.00, true)
ON CONFLICT (segmento) DO NOTHING;

COMMENT ON TABLE public.nsm_eventos IS 'Append-only · 1 linha por engajamento de pessoa em valor da CBRio. Triggers das tabelas de origem inserem aqui.';
COMMENT ON TABLE public.nsm_estado IS '1 linha por segmento (central, cbrio, online, cba, ou customizado). Recalculada via funcao recalcular_nsm() em cron horario. Painel consulta direto.';
COMMENT ON COLUMN public.nsm_estado.segmento_filtro IS 'JSON com criterio de filtro do segmento. Ex: {"tipo":"sede"} ou {"area":"AMI"}. Nulo = sem filtro (central).';
COMMENT ON COLUMN public.nsm_estado.por_valor IS 'JSON com breakdown dos engajados por valor. Ex: {"seguir":42, "conectar":38, "investir":15, ...}';
