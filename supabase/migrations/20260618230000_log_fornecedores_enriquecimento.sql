-- Fornecedores · status do enriquecimento (Receita/IA)
--
-- enriquecimento_status: NULL = não tentado · 'enriquecido' = achou e preencheu ·
-- 'nao_encontrado' = tentou e a Receita não tinha (sinaliza pra ação manual).
-- Permite o "buscar dados em massa" rodar em lotes sem reprocessar os já tentados.

ALTER TABLE public.log_fornecedores
  ADD COLUMN IF NOT EXISTS enriquecimento_status TEXT,
  ADD COLUMN IF NOT EXISTS enriquecimento_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_log_fornecedores_enriq
  ON public.log_fornecedores (enriquecimento_status);

COMMENT ON COLUMN public.log_fornecedores.enriquecimento_status IS
  'NULL=não tentado · enriquecido · nao_encontrado (Receita não tinha · sinaliza ação manual)';
