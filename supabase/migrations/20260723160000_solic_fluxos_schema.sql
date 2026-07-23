-- Motor de fluxo configurável de Solicitações · Fase 1 (schema · aditivo, inerte).
-- Cria o modelo de dados do editor de fluxo por categoria (etapas/transições/
-- responsável-por-etapa) + colunas em `solicitacoes`. NADA lê essas tabelas ainda
-- (Fase 1), então não há mudança de comportamento. NÃO altera o enum de status,
-- vw_solicitacoes_sla nem KPIs. Tabelas de configuração (sem PII · só FK de
-- profile). RLS: leitura autenticado, escrita super-admin, service_role full.
-- Idempotente.

-- ── solic_fluxos · 1 versão por categoria ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solic_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  versao int NOT NULL DEFAULT 1,
  is_ativa boolean NOT NULL DEFAULT false,
  nome text,
  descricao text,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_solic_fluxos_cat_versao
  ON public.solic_fluxos (categoria, versao) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_solic_fluxos_ativa
  ON public.solic_fluxos (categoria) WHERE is_ativa AND deleted_at IS NULL;

-- ── solic_fluxo_etapas · nós ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solic_fluxo_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id uuid NOT NULL REFERENCES public.solic_fluxos(id) ON DELETE CASCADE,
  chave text NOT NULL,
  label text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('inicio','etapa','aprovacao','execucao','entrega','fim')),
  ordem int NOT NULL DEFAULT 0,
  area text,
  modulo text,
  status_map text,          -- mapeia pro literal existente de solicitacoes.status (pino da retrocompat)
  sla_horas int,
  pos_x numeric,
  pos_y numeric,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_solic_fluxo_etapas_chave
  ON public.solic_fluxo_etapas (fluxo_id, chave) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_solic_fluxo_etapas_fluxo
  ON public.solic_fluxo_etapas (fluxo_id) WHERE deleted_at IS NULL;

-- ── solic_fluxo_transicoes · arestas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solic_fluxo_transicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id uuid NOT NULL REFERENCES public.solic_fluxos(id) ON DELETE CASCADE,
  de_etapa_id uuid REFERENCES public.solic_fluxo_etapas(id) ON DELETE CASCADE,
  para_etapa_id uuid REFERENCES public.solic_fluxo_etapas(id) ON DELETE CASCADE,
  verbo text,               -- ação/endpoint que dispara: aprovar_origem, registrar_cotacao, aprovar_financeiro, comprar, pagar, entregar...
  condicao_tipo text,       -- NULL | forma_pagamento | valor_limite | planejado | precisa_financeiro
  condicao_valor jsonb,
  ordem int NOT NULL DEFAULT 0,  -- ordem de avaliação da bifurcação (1ª que casa vence)
  estilo text,
  label text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_solic_fluxo_transicoes_fluxo
  ON public.solic_fluxo_transicoes (fluxo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_solic_fluxo_transicoes_de
  ON public.solic_fluxo_transicoes (de_etapa_id) WHERE deleted_at IS NULL;

-- ── solic_fluxo_etapa_responsaveis · propagação de permissão ─────────────────
-- É a tabela que os guards passarão a consultar (Fase 1: só existe · Fase 3: lida).
CREATE TABLE IF NOT EXISTS public.solic_fluxo_etapa_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.solic_fluxo_etapas(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_solic_fluxo_etapa_resp
  ON public.solic_fluxo_etapa_responsaveis (etapa_id, profile_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_solic_fluxo_etapa_resp_profile
  ON public.solic_fluxo_etapa_responsaveis (profile_id) WHERE deleted_at IS NULL;

-- ── colunas em solicitacoes (nullable · NULL = fluxo legado/hardcoded) ────────
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS fluxo_id uuid REFERENCES public.solic_fluxos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fluxo_versao int,
  ADD COLUMN IF NOT EXISTS etapa_atual_id uuid REFERENCES public.solic_fluxo_etapas(id) ON DELETE SET NULL;

-- ── RLS · leitura autenticado, escrita super-admin, service_role full ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'solic_fluxos','solic_fluxo_etapas','solic_fluxo_transicoes','solic_fluxo_etapa_responsaveis'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);', t||'_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());', t||'_write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_service', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t||'_service', t);
  END LOOP;
END $$;

-- ── Audit · quem mexe no fluxo e nos responsáveis (permission-relevant) ───────
DROP TRIGGER IF EXISTS trg_audit_solic_fluxos ON public.solic_fluxos;
CREATE TRIGGER trg_audit_solic_fluxos
  AFTER INSERT OR UPDATE OR DELETE ON public.solic_fluxos
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('categoria,versao,is_ativa,deleted_at');

DROP TRIGGER IF EXISTS trg_audit_solic_fluxo_etapa_resp ON public.solic_fluxo_etapa_responsaveis;
CREATE TRIGGER trg_audit_solic_fluxo_etapa_resp
  AFTER INSERT OR UPDATE OR DELETE ON public.solic_fluxo_etapa_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('etapa_id,profile_id,deleted_at');

COMMENT ON TABLE public.solic_fluxos IS 'Motor de fluxo de Solicitações · 1 versão por categoria (Fase 1 · inerte).';
COMMENT ON TABLE public.solic_fluxo_etapa_responsaveis IS 'Responsável por etapa · tabela que os guards passarão a consultar (propagação de permissão · não toca a matriz de cargos).';
