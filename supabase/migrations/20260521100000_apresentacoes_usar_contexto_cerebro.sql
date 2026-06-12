-- =====================================================================
-- Apresentacoes · flag pra usar todo o contexto do Cerebro CBRio
-- =====================================================================
-- Quando true, o backend lista todas as notas .md da biblioteca SharePoint
-- "Cerebro CBRio", baixa em paralelo, e injeta o conteudo concatenado como
-- contexto institucional adicional pra IA gerar a apresentacao.
--
-- Idempotente · safe pra re-rodar.
-- =====================================================================

ALTER TABLE public.apresentacoes
  ADD COLUMN IF NOT EXISTS usar_contexto_cerebro boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.apresentacoes.usar_contexto_cerebro IS
  'Se true, injeta todas as notas do vault Cerebro CBRio como contexto da IA';
