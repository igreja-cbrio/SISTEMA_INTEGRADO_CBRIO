-- Porta 5 · Next entra no Contrato de Inscrição (F3.1 · PR 5 · M7)
-- Specs: docs/modulo-inscricoes/ (D1–D9 + ajuste 28/07). SÓ ADD — nenhuma
-- linha existente muda. Tabela ÚNICA (next_matriculas) → 1 colagem só.
-- Se falhar com "lock timeout": rodar de novo (idempotente).
SET lock_timeout = '10s';

ALTER TABLE public.next_matriculas
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_optin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_optin_em TIMESTAMPTZ;

-- A coluna sexo existe desde 20260723233000 SEM writer e sem CHECK (nenhuma
-- linha tem valor) — o CHECK entra direto e o formulário liga o writer com o
-- vocabulário canônico masculino|feminino (D8).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_next_mat_sexo') THEN
    ALTER TABLE public.next_matriculas
      ADD CONSTRAINT chk_next_mat_sexo CHECK (sexo IS NULL OR sexo IN ('masculino','feminino'));
  END IF;
END $$;

-- updated_at automático (a tabela nunca teve trigger; era carimbado à mão)
CREATE OR REPLACE FUNCTION public.fn_next_matriculas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_next_matriculas_updated_at ON public.next_matriculas;
CREATE TRIGGER trg_next_matriculas_updated_at
  BEFORE UPDATE ON public.next_matriculas
  FOR EACH ROW EXECUTE FUNCTION public.fn_next_matriculas_updated_at();

COMMENT ON COLUMN public.next_matriculas.whatsapp_optin IS
  'Opt-in explícito do formulário público (D4 · Contrato de Inscrição); o estado espelha também em mem_membros quando há vínculo.';
