-- Censo · F1d — vínculo e correção de cadastro SAEM do caminho do culto.
--
-- POR QUÊ (medido, não estimado — backend/scripts/censo_carga.cjs, 2026-08-06):
-- cada resposta custava 8,3 idas ao banco, e 7 delas eram o matcher (achar a
-- pessoa na base) mais a reconciliação do cadastro. Com 2.500 pessoas
-- respondendo num culto, isso é ~17.500 queries de trabalho DERIVADO
-- acontecendo com a pessoa olhando a tela esperando.
--
-- A resposta é o dado que não dá para pedir de novo. Vínculo e cadastro são
-- deriváveis do payload a qualquer momento. Então durante a coleta só gravamos
-- a resposta; o resto é um passe posterior — que ainda por cima é melhor, porque
-- dá para revisar conflito de cadastro com calma em vez de no meio do culto, e
-- o matcher acerta mais rodando sobre o lote inteiro (a mesma pessoa que
-- respondeu duas vezes aparece junto).
--
-- Quem usou o atalho de CPF (prefill) já chega com `membro_id` a custo ZERO de
-- query, e segue protegido pela UNIQUE contra resposta repetida.
--
-- Depois desta mudança: 2,9 queries por resposta (de 8,3).
--
-- Idempotente.

SET lock_timeout = '10s';

ALTER TABLE public.cen_resposta
  ADD COLUMN IF NOT EXISTS pos_processado_em TIMESTAMPTZ;
ALTER TABLE public.cen_resposta
  ADD COLUMN IF NOT EXISTS pos_processo_erro TEXT;

-- Índice PARCIAL: só as pendentes. A fila esvazia, então o índice fica pequeno
-- para sempre em vez de crescer com o histórico do censo.
CREATE INDEX IF NOT EXISTS idx_cen_resposta_pendente
  ON public.cen_resposta (pesquisa_id, concluida_em)
  WHERE pos_processado_em IS NULL AND concluida_em IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.cen_resposta.pos_processado_em IS
  'Quando o vínculo com a pessoa e a correção do cadastro foram aplicados. NULL = ainda na fila. Durante o culto só gravamos a resposta: em teste de carga, matcher + reconciliação eram 7 das 8,3 queries por resposta.';
COMMENT ON COLUMN public.cen_resposta.pos_processo_erro IS
  'Último erro do pós-processamento. Preenchido = a linha continua na fila e alguém precisa olhar.';

-- ── Conferência ───────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='cen_resposta' AND column_name LIKE 'pos_%';       -- 2 linhas
-- SELECT count(*) FROM public.cen_resposta
--   WHERE pos_processado_em IS NULL AND concluida_em IS NOT NULL;       -- tamanho da fila
