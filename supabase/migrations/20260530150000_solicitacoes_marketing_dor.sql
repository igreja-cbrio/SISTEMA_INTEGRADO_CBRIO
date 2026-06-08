-- ============================================================================
-- Marketing · REDESENHO · Fase 1 · Intake por dor (campos em solicitacoes)
-- Marcos 2026-05-30: o solicitante de marketing descreve a DOR (titulo + descricao
-- ja existentes) + publico-alvo + ideia opcional. NAO escolhe mais o entregavel
-- (isso vira decisao do Pedro na triagem · Fase 2). ADITIVO · idempotente.
-- As colunas marketing_tipo_id/marketing_destino_id continuam existindo · o intake
-- so para de preenche-las (Pedro classifica na triagem).
-- ============================================================================
BEGIN;

ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS mkt_publico_alvo  text,
  ADD COLUMN IF NOT EXISTS mkt_ideia_inicial text;

COMMENT ON COLUMN public.solicitacoes.mkt_publico_alvo IS
  'Marketing (intake por dor · Redesenho 2026-05-30): quem a demanda quer atingir (voluntarios|membros|visitantes|lideranca|comunidade|igreja_toda|outro).';
COMMENT ON COLUMN public.solicitacoes.mkt_ideia_inicial IS
  'Marketing (intake por dor): "tem algo em mente?" opcional do solicitante · referencia/ideia. O Pedro decide o formato final.';

COMMIT;
