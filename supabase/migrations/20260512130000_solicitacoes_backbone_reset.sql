-- ============================================================================
-- SOLICITACOES · BACKBONE · RESET E RECRIA (substitui 100000/110000/115000)
--
-- Estavamos batendo em "enum must be committed" do Postgres. Solucao:
-- DROP completo dos artefatos parciais + recria tudo numa unica migration
-- com o enum ja contendo 'reserva_espaco' desde o inicio (sem 'limpeza').
--
-- Pode rodar VARIAS vezes (idempotente):
-- - DROP CASCADE limpa tudo
-- - CREATE com IF NOT EXISTS / OR REPLACE
-- - Seed com ON CONFLICT DO NOTHING
--
-- Marcos: "exclua as tabelas que ja existem e crie novamente". OK · vai.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP CASCADE · limpa tudo que migracoes anteriores criaram parcial
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_solicitacoes_sla CASCADE;
DROP VIEW IF EXISTS public.vw_reserva_espacos CASCADE;

DROP TRIGGER IF EXISTS tg_solicitacoes_sla ON public.solicitacoes;
DROP TRIGGER IF EXISTS tg_solicitacoes_log ON public.solicitacoes;
DROP TRIGGER IF EXISTS tg_solicitacoes_log_upd ON public.solicitacoes;
DROP FUNCTION IF EXISTS public.tg_solicitacoes_calcula_sla() CASCADE;
DROP FUNCTION IF EXISTS public.tg_solicitacoes_log_status() CASCADE;
DROP FUNCTION IF EXISTS public.calcular_sla_deadlines(text, text, boolean, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.calcular_sla_deadlines(area_adm_resp, text, boolean, timestamptz) CASCADE;

DROP TABLE IF EXISTS public.solicitacoes_eventos CASCADE;
DROP TABLE IF EXISTS public.sla_definicoes CASCADE;
DROP TABLE IF EXISTS public.area_alcadas CASCADE;

-- Remove colunas dos enums em solicitacoes pra poder dropar os enums
ALTER TABLE public.solicitacoes
  DROP COLUMN IF EXISTS area_responsavel,
  DROP COLUMN IF EXISTS area_cliente,
  DROP COLUMN IF EXISTS subcategoria,
  DROP COLUMN IF EXISTS eh_urgente,
  DROP COLUMN IF EXISTS justificativa_urgencia,
  DROP COLUMN IF EXISTS data_necessaria,
  DROP COLUMN IF EXISTS respondido_em,
  DROP COLUMN IF EXISTS concluido_em,
  DROP COLUMN IF EXISTS sla_resposta_deadline,
  DROP COLUMN IF EXISTS sla_resolucao_deadline,
  DROP COLUMN IF EXISTS precisa_aprovacao_financeira,
  DROP COLUMN IF EXISTS aprovado_financeiro_em,
  DROP COLUMN IF EXISTS aprovado_financeiro_por,
  DROP COLUMN IF EXISTS nps_nota,
  DROP COLUMN IF EXISTS nps_comentario,
  DROP COLUMN IF EXISTS proposta_orcamento,
  DROP COLUMN IF EXISTS proposta_cronograma,
  DROP COLUMN IF EXISTS espaco_solicitado,
  DROP COLUMN IF EXISTS data_uso,
  DROP COLUMN IF EXISTS horario_inicio,
  DROP COLUMN IF EXISTS horario_fim,
  DROP COLUMN IF EXISTS qtde_pessoas;

DROP TYPE IF EXISTS area_adm_resp CASCADE;
DROP TYPE IF EXISTS area_kpi CASCADE;

-- Volta status pro check original (sem novos valores) ate recriar
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido'));

-- ----------------------------------------------------------------------------
-- 2. CRIA ENUMS · ja com reserva_espaco (sem limpeza)
-- ----------------------------------------------------------------------------
CREATE TYPE area_adm_resp AS ENUM (
  'reserva_espaco',
  'cozinha',
  'manutencao',
  'logistica_estoque',
  'logistica_compras',
  'ti',
  'rh',
  'financeiro'
);

CREATE TYPE area_kpi AS ENUM ('kids', 'ami', 'bridge', 'sede', 'online', 'cba');

-- ----------------------------------------------------------------------------
-- 3. RECRIA colunas em solicitacoes
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes
  ADD COLUMN area_responsavel area_adm_resp,
  ADD COLUMN area_cliente area_kpi,
  ADD COLUMN subcategoria text,
  ADD COLUMN eh_urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN justificativa_urgencia text,
  ADD COLUMN data_necessaria date,
  ADD COLUMN respondido_em timestamptz,
  ADD COLUMN concluido_em timestamptz,
  ADD COLUMN sla_resposta_deadline timestamptz,
  ADD COLUMN sla_resolucao_deadline timestamptz,
  ADD COLUMN precisa_aprovacao_financeira boolean NOT NULL DEFAULT false,
  ADD COLUMN aprovado_financeiro_em timestamptz,
  ADD COLUMN aprovado_financeiro_por uuid REFERENCES auth.users(id),
  ADD COLUMN nps_nota smallint CHECK (nps_nota IS NULL OR (nps_nota >= 0 AND nps_nota <= 10)),
  ADD COLUMN nps_comentario text,
  ADD COLUMN proposta_orcamento numeric,
  ADD COLUMN proposta_cronograma text,
  ADD COLUMN espaco_solicitado text,
  ADD COLUMN data_uso date,
  ADD COLUMN horario_inicio time,
  ADD COLUMN horario_fim time,
  ADD COLUMN qtde_pessoas int;

-- Status estendido
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN (
    'pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido',
    'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega', 'avaliado'
  ));

CREATE INDEX IF NOT EXISTS idx_solicitacoes_area_resp ON public.solicitacoes (area_responsavel) WHERE area_responsavel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_area_cliente ON public.solicitacoes (area_cliente) WHERE area_cliente IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_concluido ON public.solicitacoes (concluido_em DESC) WHERE concluido_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_urgente ON public.solicitacoes (eh_urgente, area_responsavel) WHERE eh_urgente = true;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_pendente_sla ON public.solicitacoes (sla_resposta_deadline)
  WHERE status IN ('pendente', 'em_analise', 'aguardando_aprovacao_financeira');
CREATE INDEX IF NOT EXISTS idx_solicitacoes_reserva_espaco
  ON public.solicitacoes (data_uso, horario_inicio)
  WHERE area_responsavel = 'reserva_espaco' AND data_uso IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. CRIA sla_definicoes + seed (ja com reserva_espaco · sem limpeza)
-- ----------------------------------------------------------------------------
CREATE TABLE public.sla_definicoes (
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

CREATE POLICY sla_read ON public.sla_definicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY sla_admin ON public.sla_definicoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));

INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao) VALUES
  -- RESERVA DE ESPACO (engloba limpeza + preparacao do espaco)
  ('reserva_espaco',   'default', false, 168, 336, 'Planejado · 1 semana resposta com cronograma + execucao 2 semanas'),
  ('reserva_espaco',   'default', true,  24,  48,  'Urgente · reparo que afeta culto'),
  -- COZINHA
  ('cozinha',          'default', false, 168, 336, 'Planejado · 1 semana resposta com cronograma + execucao 2 semanas'),
  ('cozinha',          'default', true,  24,  48,  'Urgente · evento iminente'),
  -- MANUTENCAO (infraestrutura)
  ('manutencao',       'default', false, 168, 336, 'Planejado · cronograma e orcamento em 1 semana'),
  ('manutencao',       'default', true,  24,  48,  'Urgente · reparo emergencial'),
  -- LOGISTICA - ESTOQUE
  ('logistica_estoque','default', false, 48,  72,  'Tem estoque · resposta 2d + entrega 3d'),
  ('logistica_estoque','default', true,  4,   8,   'Urgente · entrega no mesmo dia'),
  -- LOGISTICA - COMPRAS
  ('logistica_compras','default', false, 168, 504, 'Padrao · 1 sem cotacao + 2 sem entrega'),
  ('logistica_compras','default', true,  4,   24,  'Urgente · compra na rua mesmo dia (sem cotacao)'),
  -- TI · sem janela 24h porque igreja nao opera 24/7
  ('ti',               'default', false, 24,  48,  'Padrao · resposta em 1 dia util'),
  ('ti',               'default', true,  4,   8,   'Urgente · resposta no mesmo dia util'),
  -- FINANCEIRO
  ('financeiro',       'reembolso',    false, 48, 120, 'Reembolso · resposta 2d + pagamento 5d'),
  ('financeiro',       'reembolso',    true,  24, 48,  'Reembolso urgente'),
  ('financeiro',       'aprovacao',    false, 48, 48,  'Aprovacao de gasto acima da alcada'),
  ('financeiro',       'aprovacao',    true,  4,  4,   'Aprovacao urgente'),
  -- RH
  ('rh', 'vaga_nova',    false, 72,  1080, 'Vaga nova · 3d resposta + 45d preenchimento'),
  ('rh', 'vaga_nova',    true,  24,  720,  'Vaga urgente'),
  ('rh', 'treinamento',  false, 168, 168,  'Solicitar capacitacao · 1 semana resposta'),
  ('rh', 'documentacao', false, 48,  120,  'Doc CLT/atestado · 2d resposta + 5d'),
  ('rh', 'ferias',       false, 72,  72,   'Aprovacao de ferias · 3 dias'),
  ('rh', 'duvida',       false, 24,  48,   'Duvida geral CLT/RH'),
  ('rh', 'default',      false, 48,  72,   'Outras solicitacoes RH'),
  ('rh', 'default',      true,  4,   24,   'RH urgente');

COMMENT ON TABLE public.sla_definicoes IS 'SLA por area_responsavel + subcategoria + urgencia.';

-- ----------------------------------------------------------------------------
-- 5. CRIA area_alcadas
-- ----------------------------------------------------------------------------
CREATE TABLE public.area_alcadas (
  area_cliente       area_kpi PRIMARY KEY,
  limite_aprovacao   numeric NOT NULL DEFAULT 1000,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  observacoes        text
);

ALTER TABLE public.area_alcadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY area_alcadas_read ON public.area_alcadas FOR SELECT TO authenticated USING (true);
CREATE POLICY area_alcadas_admin ON public.area_alcadas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));

INSERT INTO public.area_alcadas (area_cliente, limite_aprovacao) VALUES
  ('kids',   1000),
  ('ami',    1000),
  ('bridge', 1000),
  ('sede',   1000),
  ('online', 1000),
  ('cba',    1000);

-- ----------------------------------------------------------------------------
-- 6. CRIA solicitacoes_eventos (audit log)
-- ----------------------------------------------------------------------------
CREATE TABLE public.solicitacoes_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo     text NOT NULL,
  ator_id         uuid REFERENCES auth.users(id),
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_solic_eventos_solic ON public.solicitacoes_eventos (solicitacao_id, created_at DESC);

ALTER TABLE public.solicitacoes_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY solic_eventos_read ON public.solicitacoes_eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY solic_eventos_write ON public.solicitacoes_eventos FOR INSERT TO authenticated WITH CHECK (true);

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
  SELECT sla_resposta_horas, sla_resolucao_horas INTO v_def
    FROM public.sla_definicoes
   WHERE area_responsavel = p_area_resp
     AND subcategoria = COALESCE(p_subcategoria, 'default')
     AND eh_urgente = p_urgente
     AND ativo = true
   LIMIT 1;

  IF v_def IS NULL THEN
    SELECT sla_resposta_horas, sla_resolucao_horas INTO v_def
      FROM public.sla_definicoes
     WHERE area_responsavel = p_area_resp
       AND subcategoria = 'default'
       AND eh_urgente = p_urgente
       AND ativo = true
     LIMIT 1;
  END IF;

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

CREATE TRIGGER tg_solicitacoes_sla
  BEFORE INSERT OR UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_calcula_sla();

-- ----------------------------------------------------------------------------
-- 9. TRIGGER · audit log
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

    IF NEW.respondido_em IS NULL AND NEW.status IN ('em_analise', 'em_atendimento', 'aprovado', 'aguardando_entrega') THEN
      NEW.respondido_em := now();
    END IF;
    IF NEW.concluido_em IS NULL AND NEW.status = 'concluido' THEN
      NEW.concluido_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_solicitacoes_log
  AFTER INSERT ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_log_status();

CREATE TRIGGER tg_solicitacoes_log_upd
  BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacoes_log_status();

-- ----------------------------------------------------------------------------
-- 10. VIEWS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_solicitacoes_sla AS
SELECT
  s.*,
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

CREATE OR REPLACE VIEW public.vw_reserva_espacos AS
SELECT
  s.id,
  s.titulo,
  s.espaco_solicitado,
  s.data_uso,
  s.horario_inicio,
  s.horario_fim,
  s.qtde_pessoas,
  s.area_cliente,
  s.solicitante_id,
  s.status,
  s.created_at,
  p.name AS solicitante_nome
FROM public.solicitacoes s
LEFT JOIN public.profiles p ON p.id = s.solicitante_id
WHERE s.area_responsavel = 'reserva_espaco'
  AND s.status NOT IN ('rejeitado')
  AND s.data_uso IS NOT NULL
ORDER BY s.data_uso, s.horario_inicio;

GRANT SELECT ON public.vw_reserva_espacos TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT area_responsavel, count(*) FROM sla_definicoes GROUP BY area_responsavel ORDER BY area_responsavel;
-- Espera: reserva_espaco, cozinha, manutencao, logistica_estoque/compras, ti, rh, financeiro
-- SELECT count(*) FROM area_alcadas; -- 6
