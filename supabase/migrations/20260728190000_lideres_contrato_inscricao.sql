-- Porta 3 · Líderes/Anfitriões entram no Contrato de Inscrição (F3.1 · PR 3)
-- Specs: docs/modulo-inscricoes/ (D1–D9 + ajuste 28/07). SÓ ADD — nenhuma
-- linha existente muda. Tabela ÚNICA (mem_lider_inscricoes) → 1 colagem só.
-- Se falhar com "lock timeout": rodar de novo (idempotente).
SET lock_timeout = '10s';

-- A tabela nasceu sem coluna de origem — candidatura pública e cadastro manual
-- eram indistinguíveis. Linhas antigas ganham o DEFAULT (todas vieram do form
-- público — a tabela só teve esse writer até hoje).
ALTER TABLE public.mem_lider_inscricoes
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'formulario_publico';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lider_insc_origem') THEN
    ALTER TABLE public.mem_lider_inscricoes
      ADD CONSTRAINT chk_lider_insc_origem CHECK (origem IN ('formulario_publico','manual'));
  END IF;
END $$;

-- updated_at automático (a tabela nunca teve trigger; era carimbado à mão nas
-- rotas de aceitar/recusar/promover/vincular — o trigger passa a garantir)
CREATE OR REPLACE FUNCTION public.fn_mem_lider_inscricoes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_mem_lider_inscricoes_updated_at ON public.mem_lider_inscricoes;
CREATE TRIGGER trg_mem_lider_inscricoes_updated_at
  BEFORE UPDATE ON public.mem_lider_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_mem_lider_inscricoes_updated_at();

COMMENT ON COLUMN public.mem_lider_inscricoes.origem IS
  'formulario_publico|manual — Contrato de Inscrição (porta grupos_lider).';
