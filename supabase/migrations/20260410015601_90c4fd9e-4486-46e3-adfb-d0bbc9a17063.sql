
-- Fix categoria constraint to include 'infraestrutura'
ALTER TABLE public.solicitacoes DROP CONSTRAINT solicitacoes_categoria_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_categoria_check 
  CHECK (categoria = ANY (ARRAY['ti','compras','reembolso','espaco','infraestrutura','ferias','outro']));

-- Create notificacoes table
CREATE TABLE public.notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  tipo TEXT,
  modulo TEXT,
  severidade TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  chave_dedup TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notificacoes" ON public.notificacoes FOR SELECT USING (true);
CREATE POLICY "Service can insert notificacoes" ON public.notificacoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notificacoes" ON public.notificacoes FOR UPDATE USING (true);
CREATE POLICY "Users can delete own notificacoes" ON public.notificacoes FOR DELETE USING (true);

CREATE INDEX idx_notificacoes_usuario ON public.notificacoes(usuario_id);
CREATE INDEX idx_notificacoes_dedup ON public.notificacoes(usuario_id, chave_dedup) WHERE lida = false;

-- Create notificacao_regras table
CREATE TABLE public.notificacao_regras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modulo TEXT NOT NULL,
  profile_id UUID NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacao_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read notificacao_regras" ON public.notificacao_regras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write notificacao_regras" ON public.notificacao_regras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update notificacao_regras" ON public.notificacao_regras FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete notificacao_regras" ON public.notificacao_regras FOR DELETE TO authenticated USING (true);
