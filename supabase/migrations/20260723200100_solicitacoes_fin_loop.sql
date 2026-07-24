-- Fechar o loop financeiro das compras · Fase 1 (aditivo · sem escrita no razão).
-- Classificação contábil + NF + elo com a transação, tudo em `solicitacoes`
-- (fonte única · reusa fin_plano_contas/fin_centros_custo/fin_transacoes por ID).
-- Nada aqui cria fin_transacoes; só prepara os campos. Idempotente.
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS plano_contas_id uuid REFERENCES public.fin_plano_contas(id),
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES public.fin_centros_custo(id),
  ADD COLUMN IF NOT EXISTS nota_fiscal_url text,
  ADD COLUMN IF NOT EXISTS nota_fiscal_extracao jsonb,   -- extração saneada da NF (cnpj/nome p/ aprenderClassificacao)
  ADD COLUMN IF NOT EXISTS fin_transacao_id uuid REFERENCES public.fin_transacoes(id),
  ADD COLUMN IF NOT EXISTS fin_vinculo_status text
    CHECK (fin_vinculo_status IN ('pendente','lancado','conciliado','cancelado'));

-- Busca reversa (a transação sabe de qual pedido veio).
ALTER TABLE public.fin_transacoes
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.solicitacoes(id);

CREATE INDEX IF NOT EXISTS fin_transacoes_solicitacao_idx
  ON public.fin_transacoes(solicitacao_id) WHERE solicitacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS solicitacoes_fin_transacao_idx
  ON public.solicitacoes(fin_transacao_id) WHERE fin_transacao_id IS NOT NULL;
