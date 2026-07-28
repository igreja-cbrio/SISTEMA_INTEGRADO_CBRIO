-- Porta 2 · Apresentação de Crianças entra no Contrato de Inscrição (F3.1 · PR 2)
-- Specs: docs/modulo-inscricoes/ (D1–D9 + ajuste 28/07). SÓ ADD — nenhuma linha
-- existente muda. Tabela ÚNICA (apresentacao_criancas) → 1 colagem só, sem
-- risco de deadlock multi-tabela. Se falhar com "lock timeout": rodar de novo.
SET lock_timeout = '10s';

ALTER TABLE public.apresentacao_criancas
  ADD COLUMN IF NOT EXISTS responsavel_membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS crianca_data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS crianca_sexo TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT;

-- CHECKs. O de status entra NOT VALID de propósito: vale pra escritas novas e
-- NÃO valida as linhas antigas (o PATCH histórico aceitava status cru; o
-- VALIDATE fica pra depois de conferir os DISTINCTs em produção).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_apres_crianca_sexo') THEN
    ALTER TABLE public.apresentacao_criancas
      ADD CONSTRAINT chk_apres_crianca_sexo CHECK (crianca_sexo IS NULL OR crianca_sexo IN ('masculino','feminino'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_apres_status') THEN
    ALTER TABLE public.apresentacao_criancas
      ADD CONSTRAINT chk_apres_status CHECK (status IN ('pendente','confirmado','realizado','cancelado')) NOT VALID;
  END IF;
END $$;

-- Índice do dedup (mesma criança × mesmo CPF × mesma data não duplica)
CREATE INDEX IF NOT EXISTS idx_apres_cpf_data
  ON public.apresentacao_criancas (cpf_responsavel, data_apresentacao) WHERE deleted_at IS NULL;

-- updated_at automático (a tabela nunca teve trigger; era carimbado à mão)
CREATE OR REPLACE FUNCTION public.fn_apresentacao_criancas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_apresentacao_criancas_updated_at ON public.apresentacao_criancas;
CREATE TRIGGER trg_apresentacao_criancas_updated_at
  BEFORE UPDATE ON public.apresentacao_criancas
  FOR EACH ROW EXECUTE FUNCTION public.fn_apresentacao_criancas_updated_at();

COMMENT ON COLUMN public.apresentacao_criancas.responsavel_membro_id IS
  'Responsável ligado via matcher canônico (Contrato de Inscrição · porta apresentacao).';
COMMENT ON COLUMN public.apresentacao_criancas.crianca_data_nascimento IS
  'Nascimento da criança (obrigatório p/ inscrições novas; antigas só têm crianca_idade texto).';
