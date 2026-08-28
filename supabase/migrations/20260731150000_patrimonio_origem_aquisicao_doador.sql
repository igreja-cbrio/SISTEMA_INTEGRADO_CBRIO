-- ============================================================================
-- Patrimônio · doação RECEBIDA (bem que a igreja GANHA de alguém)
-- ----------------------------------------------------------------------------
-- Decisão do usuário 2026-07-31 (via conselho deliberativo): a informação
-- mora no CADASTRO do bem (fato permanente de proveniência), não numa
-- movimentação — "entrada" em pat_movimentacoes continua servindo só pra
-- reposicionar um bem já cadastrado, sem relação com como ele foi adquirido.
-- ============================================================================

ALTER TABLE public.pat_bens ADD COLUMN IF NOT EXISTS origem_aquisicao TEXT NOT NULL DEFAULT 'comprado';
ALTER TABLE public.pat_bens ADD COLUMN IF NOT EXISTS doador TEXT;
ALTER TABLE public.pat_bens ADD COLUMN IF NOT EXISTS doador_tipo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pat_bens_origem_aquisicao'
  ) THEN
    ALTER TABLE public.pat_bens ADD CONSTRAINT chk_pat_bens_origem_aquisicao
      CHECK (origem_aquisicao IN ('comprado', 'doado')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pat_bens_doador_tipo'
  ) THEN
    ALTER TABLE public.pat_bens ADD CONSTRAINT chk_pat_bens_doador_tipo
      CHECK (doador_tipo IS NULL OR doador_tipo IN ('pessoa_fisica', 'empresa', 'outro_ministerio')) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.pat_bens.origem_aquisicao IS 'comprado (default) ou doado — proveniência do bem, fato permanente do cadastro.';
COMMENT ON COLUMN public.pat_bens.doador IS 'Nome de quem doou (pessoa, empresa ou outro ministério) — só relevante quando origem_aquisicao=doado.';
COMMENT ON COLUMN public.pat_bens.doador_tipo IS 'pessoa_fisica | empresa | outro_ministerio — classificação do doador.';
