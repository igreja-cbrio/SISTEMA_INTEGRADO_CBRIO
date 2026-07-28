-- Porta 4 · Voluntariado entra no Contrato de Inscrição (F3.1 · PR 4 · M6a)
-- Specs: docs/modulo-inscricoes/ (D1–D9 + ajuste 28/07). SÓ ADD — nenhuma
-- linha existente muda. Tabela ÚNICA (vol_inscricoes) → 1 colagem só.
-- Se falhar com "lock timeout": rodar de novo (idempotente).
--
-- ⚠️ SOFT-DELETE EM 2 ETAPAS (correção do verificador de migração):
--   M6a (esta): coluna deleted_at + TODOS os leitores JS filtrando (mesma PR).
--   M6b (futura): entrada na whitelist app_soft_deletable_tables() + patch dos
--   contadores SQL (fanout do app / KPIs nativos) — SÓ depois disso alguma
--   rota pode soft-deletar. Até lá a coluna fica sempre NULL.
SET lock_timeout = '10s';

ALTER TABLE public.vol_inscricoes
  ADD COLUMN IF NOT EXISTS sexo TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vol_insc_sexo') THEN
    ALTER TABLE public.vol_inscricoes
      ADD CONSTRAINT chk_vol_insc_sexo CHECK (sexo IS NULL OR sexo IN ('masculino','feminino'));
  END IF;
END $$;

-- Índice das filas ativas (as listagens agora filtram deleted_at)
CREATE INDEX IF NOT EXISTS idx_vol_insc_ativas
  ON public.vol_inscricoes (status, data_inscricao DESC) WHERE deleted_at IS NULL;

-- updated_at automático (a tabela nunca teve trigger; era carimbado à mão)
CREATE OR REPLACE FUNCTION public.fn_vol_inscricoes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_vol_inscricoes_updated_at ON public.vol_inscricoes;
CREATE TRIGGER trg_vol_inscricoes_updated_at
  BEFORE UPDATE ON public.vol_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_vol_inscricoes_updated_at();

COMMENT ON COLUMN public.vol_inscricoes.deleted_at IS
  'Soft-delete em 2 etapas (Contrato de Inscrição M6a/M6b): NÃO usar até a whitelist + contadores SQL serem atualizados (M6b).';
