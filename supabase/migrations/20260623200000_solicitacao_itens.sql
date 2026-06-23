-- Pedido em massa nas Solicitações de Compras/Serviços (2026-06-23)
-- Permite que o solicitante liste VÁRIOS itens num único pedido (descrição +
-- quantidade + link + valor estimado + foto por item), em vez de abrir uma
-- solicitação por coisa. A coluna texto `solicitacoes.itens` segue sendo
-- preenchida com um resumo legível (backward-compat com lista/detalhe/KPIs).
--
-- Aditiva e idempotente. SEM PII (descrições/fotos de produto não são dados
-- pessoais) → não entra na whitelist de soft-delete; some junto com o pai
-- (ON DELETE CASCADE). Frontend nunca escreve direto (vai pelo backend
-- service_role); leitura embutida no GET /solicitacoes.

CREATE TABLE IF NOT EXISTS public.solicitacao_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  descricao       text NOT NULL,
  quantidade      numeric NOT NULL DEFAULT 1,
  unidade         text DEFAULT 'un',
  link_referencia text,
  valor_estimado  numeric,
  imagem_url      text,
  ordem           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_itens_solicitacao
  ON public.solicitacao_itens (solicitacao_id);

ALTER TABLE public.solicitacao_itens ENABLE ROW LEVEL SECURITY;

-- SELECT aberto a autenticados (sem PII · espelha a leitura ampla de solicitações);
-- escrita só pelo backend (service_role).
DROP POLICY IF EXISTS solicitacao_itens_select ON public.solicitacao_itens;
CREATE POLICY solicitacao_itens_select ON public.solicitacao_itens
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS solicitacao_itens_service ON public.solicitacao_itens;
CREATE POLICY solicitacao_itens_service ON public.solicitacao_itens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Bucket de anexos das solicitações (o código já referenciava 'solicitacoes',
-- mas o bucket nunca tinha sido criado → upload de comprovante/foto quebrava).
-- Público: as fotos de item e comprovantes são servidos por URL pública com
-- path randômico (não-enumerável). Upload restrito a usuários autenticados.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('solicitacoes', 'solicitacoes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "solicitacoes anexos upload autenticado" ON storage.objects;
CREATE POLICY "solicitacoes anexos upload autenticado" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'solicitacoes');

DROP POLICY IF EXISTS "solicitacoes anexos leitura publica" ON storage.objects;
CREATE POLICY "solicitacoes anexos leitura publica" ON storage.objects
  FOR SELECT USING (bucket_id = 'solicitacoes');

DROP POLICY IF EXISTS "solicitacoes anexos update autenticado" ON storage.objects;
CREATE POLICY "solicitacoes anexos update autenticado" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'solicitacoes');

DROP POLICY IF EXISTS "solicitacoes anexos delete autenticado" ON storage.objects;
CREATE POLICY "solicitacoes anexos delete autenticado" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'solicitacoes');

COMMENT ON TABLE public.solicitacao_itens IS
  'Itens de um pedido em massa (compras/serviços). 1 solicitação → N itens. Sem PII.';
