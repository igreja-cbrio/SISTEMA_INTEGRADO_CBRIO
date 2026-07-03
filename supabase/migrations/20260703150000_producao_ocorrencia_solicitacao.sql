-- ============================================================================
-- Produção · ocorrência do culto → solicitação oficial (2026-07-03)
-- ============================================================================
-- Ideia do Pedro Fernandes aprovada pelo Marcos: quem acompanha o culto
-- registra a falha (técnica/estrutura) e, na mesma hora, abre uma solicitação
-- no fluxo oficial (manutenção/TI/compras) já preenchida com o contexto.
-- Vínculo 1:1 — no máximo 1 solicitação por ocorrência (o chip de status
-- substitui o botão depois de vinculada).
--
-- ADITIVA e idempotente. Se a solicitação for removida, o vínculo vira NULL
-- (a ocorrência continua valendo como rastro pro KPI PROD-CULTO-FALHAS).

ALTER TABLE public.culto_producao_ocorrencias
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.solicitacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_culto_prod_ocorr_solicitacao
  ON public.culto_producao_ocorrencias (solicitacao_id)
  WHERE solicitacao_id IS NOT NULL;

COMMENT ON COLUMN public.culto_producao_ocorrencias.solicitacao_id IS
  'Solicitação aberta a partir desta ocorrência (atalho "Fazer solicitação" no modal da Produção · máx. 1 por ocorrência)';
