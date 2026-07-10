-- Cotações múltiplas nas Solicitações de Compras/Serviços (2026-07-10)
-- Hoje o sistema guarda UMA cotação inline em `solicitacoes` (valor_cotado,
-- cotacao_fornecedor, ...). O Amaury (compras/serviço) precisa registrar VÁRIAS
-- cotações de fornecedores (fornecedor, valor, prazo, link, observação, anexo),
-- marcar a sugerida e disparar UM e-mail ao financeiro (Yago) com todas para
-- aprovação. Esta tabela guarda cada cotação separada; a inline antiga segue
-- sendo preenchida com a cotação de referência (retrocompat com telas/KPIs).
--
-- Aditiva e idempotente. SEM PII (nome de fornecedor/valor de orçamento não é
-- dado pessoal) → não entra na whitelist de soft-delete; some junto com o pai
-- (ON DELETE CASCADE). Frontend nunca escreve direto (vai pelo backend
-- service_role); espelha a leitura ampla de `solicitacao_itens`.

CREATE TABLE IF NOT EXISTS public.solicitacao_cotacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  fornecedor      text NOT NULL,
  valor           numeric NOT NULL,
  prazo           text,           -- texto livre, ex.: "5 dias úteis"
  link            text,
  observacao      text,
  anexo_url       text,
  sugerida        boolean NOT NULL DEFAULT false,
  ordem           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_cotacoes_solicitacao
  ON public.solicitacao_cotacoes (solicitacao_id);

-- No máximo 1 cotação sugerida por solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacao_cotacoes_sugerida
  ON public.solicitacao_cotacoes (solicitacao_id) WHERE sugerida;

ALTER TABLE public.solicitacao_cotacoes ENABLE ROW LEVEL SECURITY;

-- SELECT aberto a autenticados (sem PII · espelha a leitura ampla de solicitações);
-- escrita só pelo backend (service_role).
DROP POLICY IF EXISTS solicitacao_cotacoes_select ON public.solicitacao_cotacoes;
CREATE POLICY solicitacao_cotacoes_select ON public.solicitacao_cotacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS solicitacao_cotacoes_service ON public.solicitacao_cotacoes;
CREATE POLICY solicitacao_cotacoes_service ON public.solicitacao_cotacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Carimbo do disparo do e-mail de cotações ao financeiro (reenviável).
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS cotacoes_email_em timestamptz;
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS cotacoes_email_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
