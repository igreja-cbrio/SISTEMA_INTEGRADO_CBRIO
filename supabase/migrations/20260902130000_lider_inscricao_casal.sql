-- ============================================================================
-- 20260902130000_lider_inscricao_casal.sql
--
-- Inscrição de CASAL no formulário público de líderes/anfitriões
-- (/inscricao-lideres · pedido do Marcos 02/09, motivado pelo caso
-- Edgar/Luciana Crespo, que digitaram os dois nomes num campo só porque o
-- formulário não tinha fluxo de casal).
--
-- Espelha o desenho de mem_grupo_pedidos.casal_pedido_id (20260730140000):
-- cada cônjuge é UMA inscrição própria (contrato de porta — nunca dois nomes
-- num campo de texto), e as duas apontam uma pra outra (vínculo CRUZADO), pra
-- caixa de entrada mostrar o par.
--
-- Aditiva · idempotente · nenhuma policy tocada.
-- ============================================================================

ALTER TABLE public.mem_lider_inscricoes
  ADD COLUMN IF NOT EXISTS casal_inscricao_id uuid
    REFERENCES public.mem_lider_inscricoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mem_lider_inscricoes_casal
  ON public.mem_lider_inscricoes (casal_inscricao_id)
  WHERE casal_inscricao_id IS NOT NULL;

COMMENT ON COLUMN public.mem_lider_inscricoes.casal_inscricao_id IS
'Inscrição do cônjuge quando a candidatura foi feita em par pelo formulário público (vínculo cruzado: as duas linhas apontam uma pra outra). Cada cônjuge segue sendo UMA inscrição própria — aceitar/recusar/vincular continua individual.';
