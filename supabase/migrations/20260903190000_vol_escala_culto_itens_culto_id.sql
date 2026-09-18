-- ============================================================================
-- Cobertura por HORÁRIO · `vol_escala_culto_itens.culto_id` (2026-09-03)
--
-- Passo 2 do desenho de escala por culto. O passo 1
-- (`20260903180000_vol_schedules_culto_id.sql`) deu horário ao QUEM está
-- escalado; este dá horário ao QUANTOS PRECISO.
--
-- `vol_escala_culto_itens` (1.447 linhas em 03/09) é o ALVO — o denominador da
-- cobertura, materializado por `POST /schedule-templates/:id/apply`, que copia
-- `quantidade` e `fixo` do template e guarda a linhagem em `template_id` +
-- `template_item_id`. É o carimbo: mexer no template não reescreve culto já
-- lançado (decisão do Marcos, e já era o comportamento).
--
-- ⚠️⚠️ SEM ESTA COLUNA, "faltam 2 no 9:30" É INEXPRIMÍVEL. Com o passo 1 a
-- escala já sabe o horário, mas o alvo não — então a cobertura só consegue
-- comparar contra um alvo de BLOCO. Para o time não-split isso está correto e
-- é o que vale hoje; para o time split (`Chat 9:30` precisa de 2 e `Chat 11:30`
-- de 2) o alvo tem que ser por culto, senão os dois horários dividem a mesma
-- vaga e a tela mostra cobertura errada nos dois.
--
-- ⚠️⚠️ MESMA SEMÂNTICA DE NULL DO PASSO 1, de propósito — duas colunas com a
-- mesma regra é o que deixa a junção honesta:
--   NULL            = o alvo vale para TODOS os horários do bloco.
--   culto_id setado = o alvo é daquele horário.
-- ⇒ A cobertura de um culto soma os alvos com `culto_id = <culto>` MAIS os com
-- `culto_id IS NULL`, e confronta com as escalas pela mesma régua. Se as duas
-- colunas tivessem semânticas diferentes, a conta silenciosamente contaria
-- vaga a mais ou a menos.
--
-- ⚠️ BACKFILL NULL nas 1.447 linhas, e é a verdade pelo mesmo motivo do passo
-- 1: todas foram materializadas a partir de planos do PCO, e nenhuma foi feita
-- para um horário específico. Não há nada a derivar.
--
-- ⚠️ `ON DELETE SET NULL`, nunca CASCADE: culto apagado não pode apagar o alvo
-- — o alvo volta a valer para o bloco (o comportamento de hoje), e a cobertura
-- histórica continua calculável. CASCADE apagaria o denominador e faria
-- relatório antigo mentir.
--
-- ⚠️ A UNIQUE de `vol_escala_culto_itens` NÃO é tocada (o `apply` faz INSERT e
-- usa `deleted_at` pra relançar). Se um dia existir unicidade por
-- (service_id, template_item_id), ela precisa ganhar `culto_id` junto — senão
-- um time split não consegue materializar duas linhas do MESMO item de
-- template, uma por horário. Fica registrado aqui porque é o erro natural.
-- ============================================================================

ALTER TABLE public.vol_escala_culto_itens
  ADD COLUMN IF NOT EXISTS culto_id UUID REFERENCES public.cultos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vol_escala_culto_itens.culto_id IS
  'Horário a que este ALVO se refere. NULL = o alvo vale para TODOS os horários do bloco (time não-split). Mesma semântica de vol_schedules.culto_id, de propósito: a cobertura de um culto soma os alvos daquele culto MAIS os de bloco (NULL) e confronta com as escalas pela mesma régua. As 1.447 linhas anteriores a 2026-09-03 nasceram NULL porque foram materializadas de planos consolidados do PCO — nenhuma era de um horário específico.';

CREATE INDEX IF NOT EXISTS vol_escala_culto_itens_culto_idx
  ON public.vol_escala_culto_itens(culto_id)
  WHERE culto_id IS NOT NULL;
