
-- 1. log_fornecedores
CREATE TABLE public.log_fornecedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT,
  email TEXT,
  telefone TEXT,
  contato TEXT,
  categoria TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_fornecedores" ON public.log_fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_fornecedores" ON public.log_fornecedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_fornecedores" ON public.log_fornecedores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_fornecedores" ON public.log_fornecedores FOR DELETE TO authenticated USING (true);

-- 2. log_solicitacoes_compra
CREATE TABLE public.log_solicitacoes_compra (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  justificativa TEXT,
  valor_estimado NUMERIC,
  urgencia TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pendente',
  area TEXT,
  solicitante_id UUID,
  aprovado_por UUID,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_solicitacoes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_solicitacoes_compra" ON public.log_solicitacoes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_solicitacoes_compra" ON public.log_solicitacoes_compra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_solicitacoes_compra" ON public.log_solicitacoes_compra FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_solicitacoes_compra" ON public.log_solicitacoes_compra FOR DELETE TO authenticated USING (true);

-- 3. log_pedidos
CREATE TABLE public.log_pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id UUID REFERENCES public.log_solicitacoes_compra(id) ON DELETE SET NULL,
  fornecedor_id UUID REFERENCES public.log_fornecedores(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  data_pedido TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_prevista TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'aguardando',
  codigo_rastreio TEXT,
  transportadora TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_pedidos" ON public.log_pedidos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_pedidos" ON public.log_pedidos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_pedidos" ON public.log_pedidos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_pedidos" ON public.log_pedidos FOR DELETE TO authenticated USING (true);

-- 4. log_recebimentos
CREATE TABLE public.log_recebimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES public.log_pedidos(id) ON DELETE CASCADE,
  recebido_por UUID,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_recebimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_recebimentos" ON public.log_recebimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_recebimentos" ON public.log_recebimentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_recebimentos" ON public.log_recebimentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_recebimentos" ON public.log_recebimentos FOR DELETE TO authenticated USING (true);

-- 5. log_notas_fiscais
CREATE TABLE public.log_notas_fiscais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL,
  serie TEXT,
  fornecedor_id UUID REFERENCES public.log_fornecedores(id) ON DELETE SET NULL,
  pedido_id UUID REFERENCES public.log_pedidos(id) ON DELETE SET NULL,
  valor NUMERIC,
  data_emissao TIMESTAMPTZ NOT NULL DEFAULT now(),
  chave_acesso TEXT,
  tipo TEXT NOT NULL DEFAULT 'entrada',
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_notas_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_notas_fiscais" ON public.log_notas_fiscais FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_notas_fiscais" ON public.log_notas_fiscais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_notas_fiscais" ON public.log_notas_fiscais FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_notas_fiscais" ON public.log_notas_fiscais FOR DELETE TO authenticated USING (true);

-- 6. log_pedido_itens
CREATE TABLE public.log_pedido_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.log_pedidos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  unidade TEXT NOT NULL DEFAULT 'un',
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_pedido_itens" ON public.log_pedido_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_pedido_itens" ON public.log_pedido_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_pedido_itens" ON public.log_pedido_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_pedido_itens" ON public.log_pedido_itens FOR DELETE TO authenticated USING (true);

-- 7. log_movimentacoes
CREATE TABLE public.log_movimentacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_item TEXT,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  origem TEXT,
  destino TEXT,
  observacoes TEXT,
  responsavel_id UUID,
  data_movimentacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read log_movimentacoes" ON public.log_movimentacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write log_movimentacoes" ON public.log_movimentacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update log_movimentacoes" ON public.log_movimentacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete log_movimentacoes" ON public.log_movimentacoes FOR DELETE TO authenticated USING (true);
