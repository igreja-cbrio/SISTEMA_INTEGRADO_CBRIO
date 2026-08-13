-- Fase 1 · OFX alimenta identidade por CPF (2026-07-24).
-- Vínculo transação bancária ↔ pessoa (por CPF/CNPJ do MEMO). Base pro
-- histórico/timeline do membro. Aditivo/idempotente.
ALTER TABLE public.fin_lancamentos_brutos
  ADD COLUMN IF NOT EXISTS membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_lanc_brutos_membro
  ON public.fin_lancamentos_brutos (membro_id) WHERE membro_id IS NOT NULL;
