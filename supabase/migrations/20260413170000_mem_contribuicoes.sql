-- mem_contribuicoes (Dízimos, ofertas, campanhas)
CREATE TABLE public.mem_contribuicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('dizimo', 'oferta', 'campanha')),
  valor numeric(12, 2) NOT NULL CHECK (valor >= 0),
  data date NOT NULL DEFAULT CURRENT_DATE,
  campanha text,          -- nome da campanha quando tipo = 'campanha'
  forma_pagamento text,   -- pix, dinheiro, cartao, transferencia, etc.
  origem text NOT NULL DEFAULT 'manual'  -- manual, banco, pix, importacao
    CHECK (origem IN ('manual', 'banco', 'pix', 'importacao')),
  referencia_externa text, -- id do PIX / transação bancária (futuro)
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_contribuicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_contribuicoes" ON public.mem_contribuicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_contribuicoes" ON public.mem_contribuicoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_contribuicoes" ON public.mem_contribuicoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_contribuicoes" ON public.mem_contribuicoes FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_contribuicoes_membro_data ON public.mem_contribuicoes(membro_id, data DESC);
CREATE INDEX idx_mem_contribuicoes_data ON public.mem_contribuicoes(data DESC);
CREATE INDEX idx_mem_contribuicoes_tipo ON public.mem_contribuicoes(tipo);

-- Evita duplicatas automáticas (mesma referência externa do banco/PIX não entra 2x)
CREATE UNIQUE INDEX uniq_mem_contribuicoes_referencia
  ON public.mem_contribuicoes(referencia_externa)
  WHERE referencia_externa IS NOT NULL;
