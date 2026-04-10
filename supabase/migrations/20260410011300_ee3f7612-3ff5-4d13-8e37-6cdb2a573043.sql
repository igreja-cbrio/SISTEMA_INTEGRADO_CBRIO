
-- Create solicitacoes table
CREATE TABLE public.solicitacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  justificativa TEXT,
  categoria TEXT NOT NULL CHECK (categoria IN ('ti', 'compras', 'reembolso', 'espaco', 'ferias', 'outro')),
  urgencia TEXT NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('baixa', 'normal', 'alta', 'critica')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido')),
  valor_estimado NUMERIC,
  solicitante_id UUID NOT NULL,
  responsavel_id UUID,
  area_solicitante TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_solicitacoes_solicitante ON public.solicitacoes (solicitante_id);
CREATE INDEX idx_solicitacoes_categoria ON public.solicitacoes (categoria);
CREATE INDEX idx_solicitacoes_status ON public.solicitacoes (status);

-- Enable RLS
ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all (backend filters by role/permission)
CREATE POLICY "Authenticated users can read solicitacoes"
  ON public.solicitacoes FOR SELECT
  TO authenticated
  USING (true);

-- Users can create their own solicitacoes
CREATE POLICY "Users can create own solicitacoes"
  ON public.solicitacoes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = solicitante_id);

-- Users can update solicitacoes they are responsible for, or their own
CREATE POLICY "Users can update relevant solicitacoes"
  ON public.solicitacoes FOR UPDATE
  TO authenticated
  USING (auth.uid() = solicitante_id OR auth.uid() = responsavel_id);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_solicitacoes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_solicitacoes_updated_at
  BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_solicitacoes_updated_at();
