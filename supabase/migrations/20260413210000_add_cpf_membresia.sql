-- ═══════════════════════════════════════════════════════════
-- Adiciona CPF em mem_membros e mem_cadastros_pendentes
-- ═══════════════════════════════════════════════════════════
-- O formulário público de cadastro passou a exigir CPF.
-- Armazenamos apenas dígitos (11 caracteres) para facilitar comparação
-- e respeitar formatos copiados com/sem máscara.

ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS cpf text;

ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS cpf text;

-- Índice parcial para acelerar busca/deduplicação por CPF quando presente.
CREATE INDEX IF NOT EXISTS idx_mem_membros_cpf
  ON public.mem_membros(cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mem_cadastros_pendentes_cpf
  ON public.mem_cadastros_pendentes(cpf)
  WHERE cpf IS NOT NULL;
