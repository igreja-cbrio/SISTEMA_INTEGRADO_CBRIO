-- ============================================================================
-- SOLICITACOES · backbone de toda administracao
--
-- Marcos: "modulo de solicitacoes vira a fonte unica de TODOS os KPIs adm"
--
-- Esta migration expande a tabela `solicitacoes` (legada) pra suportar:
--   · Hierarquia categoria→subcategoria
--   · Area cliente (ministerio) + Area responsavel (adm)
--   · SLA dual: resposta + resolucao (calculados via trigger)
--   · Urgencia bidirecional (eh_urgente + justificativa)
--   · Aprovacao financeira por alcada (cada area tem limite)
--   · NPS pos-conclusao
--   · Audit log de transicoes
--
-- KPIs adm serao puxados em PR separado (Fase C) via funcao SQL que
-- agrega solicitacoes filtradas por area_responsavel/area_cliente/periodo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM-tipo · area_responsavel (7 areas adm)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE area_adm_resp AS ENUM (
    'limpeza',
    'cozinha',
    'manutencao',
    'logistica_estoque',
    'logistica_compras',
    'ti',
    'rh',
    'financeiro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. ENUM-tipo · area_cliente (6 areas KPI · igual ao resto do sistema)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE area_kpi AS ENUM ('kids', 'ami', 'bridge', 'sede', 'online', 'cba');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 3. EXPANDE solicitacoes
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS area_responsavel area_adm_resp,
  ADD COLUMN IF NOT EXISTS area_cliente area_kpi,
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS eh_urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_urgencia text,
  ADD COLUMN IF NOT EXISTS data_necessaria date,
  ADD COLUMN IF NOT EXISTS respondido_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resposta_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolucao_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS precisa_aprovacao_financeira boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aprovado_financeiro_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_financeiro_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS nps_nota smallint CHECK (nps_nota IS NULL OR (nps_nota >= 0 AND nps_nota <= 10)),
  ADD COLUMN IF NOT EXISTS nps_comentario text,
  ADD COLUMN IF NOT EXISTS proposta_orcamento numeric,
  ADD COLUMN IF NOT EXISTS proposta_cronograma text;

-- Expande status pra cobrir aprovacao financeira (mantem compat com valores antigos)
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN (
    'pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido',
    'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega', 'avaliado'
  ));

-- Indices novos
CREATE INDEX IF NOT EXISTS idx_solicitacoes_area_resp ON public.solicitacoes (area_responsavel) WHERE area_responsavel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_area_cliente ON public.solicitacoes (area_cliente) WHERE area_cliente IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_concluido ON public.solicitacoes (concluido_em DESC) WHERE concluido_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_urgente ON public.solicitacoes (eh_urgente, area_responsavel) WHERE eh_urgente = true;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_pendente_sla ON public.solicitacoes (sla_resposta_deadline)
  WHERE status IN ('pendente', 'em_analise', 'aguardando_aprovacao_financeira');

-- ----------------------------------------------------------------------------
-- 4. TABELA · sla_definicoes
--    Define prazo (horas) por area_responsavel + subcategoria + urgencia
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_definicoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_responsavel    area_adm_resp NOT NULL,
  subcategoria        text NOT NULL DEFAULT 'default',
  eh_urgente          boolean NOT NULL DEFAULT false,
  sla_resposta_horas  numeric NOT NULL,
  sla_resolucao_horas numeric NOT NULL,
  descricao           text,
  ativo               boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_responsavel, subcategoria, eh_urgente)
);

ALTER TABLE public.sla_definicoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sla_read ON public.sla_definicoes FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY sla_admin ON public.sla_definicoes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed dos SLAs validados com Marcos em 2026-05-12
INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao) VALUES
  -- HOSPITALIDADE · 3 areas iguais (limpeza/cozinha/manutencao)
  ('limpeza',          'default', false, 168, 336, 'Planejado · 1 semana resposta com cronograma + execucao 2 semanas'),
  ('limpeza',          'default', true,  24,  48,  'Urgente · reparo que afeta culto'),
  ('cozinha',          'default', false, 168, 336, 'Planejado · 1 semana resposta com cronograma + execucao 2 semanas'),
  ('cozinha',          'default', true,  24,  48,  'Urgente · evento iminente'),
  ('manutencao',       'default', false, 168, 336, 'Planejado · cronograma e orcamento em 1 semana'),
  ('manutencao',       'default', true,  24,  48,  'Urgente · reparo emergencial'),

  -- LOGISTICA - ESTOQUE
  ('logistica_estoque','default', false, 48,  72,  'Tem estoque · resposta 2d + entrega 3d'),
  ('logistica_estoque','default', true,  4,   8,   'Urgente · entrega no mesmo dia'),

  -- LOGISTICA - COMPRAS
  ('logistica_compras','default', false, 168, 504, 'Padrao · 1 sem cotacao + 2 sem entrega'),
  ('logistica_compras','default', true,  4,   24,  'Urgente · compra na rua mesmo dia (sem cotacao)'),

  -- TI · sem janela 24h porque igreja nao opera 24/7 (Marcos)
  ('ti',               'default', false, 24,  48,  'Padrao · resposta em 1 dia util'),
  ('ti',               'default', true,  4,   8,   'Urgente · resposta no mesmo dia util'),

  -- FINANCEIRO · reembolsos + aprovacoes de outras areas
  ('financeiro',       'reembolso',     false, 48, 120, 'Reembolso · resposta 2d + pagamento 5d'),
  ('financeiro',       'reembolso',     true,  24, 48,  'Reembolso urgente'),
  ('financeiro',       'aprovacao',     false, 48, 48,  'Aprovacao de gasto acima da alcada'),
  ('financeiro',       'aprovacao',     true,  4,  4,   'Aprovacao urgente'),

  -- RH
  ('rh', 'vaga_nova',     false, 72,  1080, 'Vaga nova · 3d resposta + 45d preenchimento'),
  ('rh', 'vaga_nova',     true,  24,  720,  'Vaga urgente'),
  ('rh', 'treinamento',   false, 168, 168,  'Solicitar capacitacao · 1 semana resposta'),
  ('rh', 'documentacao',  false, 48,  120,  'Doc CLT/atestado/contracheque · 2d resposta + 5d'),
  ('rh', 'ferias',        false, 72,  72,   'Aprovacao de ferias/licenca · 3 dias'),
  ('rh', 'duvida',        false, 24,  48,   'Duvida geral CLT/RH'),
  ('rh', 'default',       false, 48,  72,   'Outras solicitacoes RH'),
  ('rh', 'default',       true,  4,   24,   'RH urgente')
ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO NOTHING;

COMMENT ON TABLE public.sla_definicoes IS 'SLA por area_responsavel + subcategoria + urgencia. Trigger usa essa tabela pra calcular deadlines em solicitacoes. Editavel via admin.';

-- ----------------------------------------------------------------------------
-- 5. TABELA · area_alcadas
--    Limite de gasto por area_cliente sem precisar aprovacao financeira
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.area_alcadas (
  area_cliente       area_kpi PRIMARY KEY,
  limite_aprovacao   numeric NOT NULL DEFAULT 1000,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  observacoes        text
);

ALTER TABLE public.area_alcadas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY area_alcadas_read ON public.area_alcadas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY area_alcadas_admin ON public.area_alcadas FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed inicial · R$ 1.000 default pra todas (Marcos pode ajustar individual)
INSERT INTO public.area_alcadas (area_cliente, limite_aprovacao) VALUES
  ('kids',   1000),
  ('ami',    1000),
  ('bridge', 1000),
  ('sede',   1000),
  ('online', 1000),
  ('cba',    1000)
ON CONFLICT (area_cliente) DO NOTHING;

COMMENT ON TABLE public.area_alcadas IS 'Limite de gasto sem aprovacao financeira por area de culto. Default R$ 1000.';

-- ----------------------------------------------------------------------------
-- 6. TABELA · solicitacoes_eventos (audit log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.solicitacoes_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo     text NOT NULL,
  ator_id         uuid REFERENCES auth.users(id),
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solic_eventos_solic ON public.solicitacoes_eventos (solicitacao_id, created_at DESC);

ALTER TABLE public.solicitacoes_eventos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY solic_eventos_read ON public.solicitacoes_eventos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY solic_eventos_write ON public.solicitacoes_eventos FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 7. FUNCAO · calcula deadlines SLA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_sla_deadlines(
  p_area_resp area_adm_resp,
  p_subcategoria text,
  p_urgente boolean,
  p_inicio timestamptz
) RETURNS TABLE (resposta timestamptz, resolucao timestamptz)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_def RECORD;
BEGIN
  -- Tenta subcategoria especifica
  SELECT sla_resposta_horas, sla_resolucao_horas INTO v_def
    FROM public.sla_definicoes
   WHERE area_responsavel = p_area_resp
     AND subcategoria = COALESCE(p_subcategoria, 'default')
     AND eh_urgente = p_urgente
     AND ativo = true
   LIMIT 1;

  -- Fallback: default da area+urgencia
  IF v_def IS NULL THEN
    SELECT sla_resposta_horas, sla_resolucao_horas INTO v_def
      FROM public.sla_definicoes
     WHERE area_responsavel = p_area_resp
       AND subcategoria = 'default'
       AND eh_urgente = p_urgente
       AND ativo = true
     LIMIT 1;
  END IF;

  -- Ultimo fallback · 48h padrao se nada definido
  IF v_def IS NULL THEN
    RETURN QUERY SELECT p_inicio + interval '24 hours', p_inicio + interval '48 hours';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    p_inicio + (v_def.sla_resposta_horas || ' hours')::interval,
    p_inicio + (v_def.sla_resolucao_horas || ' hours')::interval;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_sla_deadlines(area_adm_resp, text, boolean, timestamptz) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. TRIGGER · calcula deadlines + precisa_aprovacao no INSERT/UPDATE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_solicitacoes_calcula_sla()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_dl RECORD;
  v_limite numeric;
BEGIN
  -- Calcula deadlines se area_responsavel definida e nao tem deadline ainda
  IF NEW.area_responsavel IS NOT NULL
     AND (NEW.sla_resposta_deadline IS NULL OR
          (TG_OP = 'UPDATE' AND NEW.eh_urgente IS DISTINCT FROM OLD.eh_urgente))
  THEN
    SELECT * INTO v_dl FROM public.calcular_sla_deadlines(
      NEW.area_responsavel,
      NEW.subcategoria,
      NEW.eh_urgente,
      coalesce(NEW.created_at, now())
    );
    NEW.sla_resposta_deadline := v_dl.resposta;
    NEW.sla_resolucao_deadline := v_dl.resolucao;
  END IF;

  -- Decide aprovacao financeira automaticamente baseado em valor + alcada da area
  IF TG_OP = 'INSERT'
     AND NEW.valor_estimado IS NOT NULL
     AND NEW.area_cliente IS NOT NULL
     AND NEW.area_responsavel != 'financeiro'
  THEN
    SELECT limite_aprovacao INTO v_limite
      FROM public.area_alcadas
     WHERE area_cliente = NEW.area_cliente;
    v_limite := COALESCE(v_limite, 1000);
    IF NEW.valor_estimado > v_limite THEN
      NEW.precisa_aprovacao_financeira := true;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_solicitacoes_sla ON public.solicitacoes;
CREATE TRIGGER tg_solicitacoes_sla
  BEFORE INSERT OR UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_calcula_sla();

-- ----------------------------------------------------------------------------
-- 9. TRIGGER · audit log automatico em mudanca de status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_solicitacoes_log_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.solicitacoes_eventos (solicitacao_id, status_anterior, status_novo, ator_id)
    VALUES (NEW.id, NULL, NEW.status, NEW.solicitante_id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.solicitacoes_eventos (solicitacao_id, status_anterior, status_novo, ator_id)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.responsavel_id);

    -- Auto-preenche respondido_em quando passa pra em_analise/em_atendimento
    IF NEW.respondido_em IS NULL AND NEW.status IN ('em_analise', 'em_atendimento', 'aprovado', 'aguardando_entrega') THEN
      NEW.respondido_em := now();
    END IF;
    -- Auto-preenche concluido_em quando passa pra concluido
    IF NEW.concluido_em IS NULL AND NEW.status = 'concluido' THEN
      NEW.concluido_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_solicitacoes_log ON public.solicitacoes;
CREATE TRIGGER tg_solicitacoes_log
  AFTER INSERT ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_log_status();

DROP TRIGGER IF EXISTS tg_solicitacoes_log_upd ON public.solicitacoes;
CREATE TRIGGER tg_solicitacoes_log_upd
  BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_log_status();

-- ----------------------------------------------------------------------------
-- 10. VIEW · solicitacoes consolidadas com flags de SLA
--     Usada pelo painel adm + KPIs (na PR seguinte)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_solicitacoes_sla AS
SELECT
  s.*,
  -- Flags de SLA
  CASE
    WHEN s.respondido_em IS NULL AND now() > s.sla_resposta_deadline THEN 'atrasado'
    WHEN s.respondido_em IS NULL THEN 'aguardando_resposta'
    WHEN s.respondido_em > s.sla_resposta_deadline THEN 'respondeu_atrasado'
    ELSE 'respondeu_no_prazo'
  END AS sla_resposta_status,
  CASE
    WHEN s.concluido_em IS NULL AND now() > s.sla_resolucao_deadline THEN 'atrasado'
    WHEN s.concluido_em IS NULL THEN 'em_andamento'
    WHEN s.concluido_em > s.sla_resolucao_deadline THEN 'concluiu_atrasado'
    ELSE 'concluiu_no_prazo'
  END AS sla_resolucao_status,
  -- Tempo gasto (em horas)
  CASE
    WHEN s.respondido_em IS NOT NULL THEN extract(epoch from (s.respondido_em - s.created_at)) / 3600
    ELSE extract(epoch from (now() - s.created_at)) / 3600
  END AS horas_para_resposta,
  CASE
    WHEN s.concluido_em IS NOT NULL THEN extract(epoch from (s.concluido_em - s.created_at)) / 3600
    ELSE extract(epoch from (now() - s.created_at)) / 3600
  END AS horas_total
FROM public.solicitacoes s;

GRANT SELECT ON public.vw_solicitacoes_sla TO authenticated, service_role;

COMMENT ON VIEW public.vw_solicitacoes_sla IS
  'Solicitacoes com flags de SLA calculadas. Use em painel/KPIs.';

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM sla_definicoes;
-- Espera: 24 linhas (3 hosp x 2 + 2 log x 2 + ti x 2 + fin · 4 + rh · 7 +ish)

-- INSERT teste:
-- INSERT INTO solicitacoes (titulo, categoria, area_responsavel, area_cliente, urgencia, eh_urgente, status, solicitante_id, valor_estimado)
-- VALUES ('Teste', 'outro', 'ti', 'kids', 'normal', false, 'pendente', auth.uid(), 500);
-- Espera: sla_resposta_deadline = created_at + 24h
