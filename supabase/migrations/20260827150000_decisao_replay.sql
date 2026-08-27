-- Decisão vinda de VÍDEO ANTIGO · separa "de que culto veio" de "quando decidiu"
-- (2026-08-27)
--
-- Pergunta do Matheus: "o vídeo fica lá... e quando um cara assistir um vídeo de
-- 2 anos e se converter, ele vai preencher o formulário, e aí, como fica?"
--
-- ⚠️⚠️ O PROBLEMA MEDIDO. `tg_cultos_dec_pessoas_to_cuidados` grava
-- `cui_convertidos.data_culto` com a DATA DO CULTO, e é dela que sai o relógio
-- do primeiro contato pastoral (SLA de 3 dias) e o recorte das coortes. Com o
-- QR por culto, uma decisão de hoje vinda de um vídeo de 2026 entraria na fila
-- com data de 2026: a pessoa nasce **atrasada em centenas de dias**, aparece
-- como caso perdido e ninguém liga para ela — o oposto do que o módulo de
-- Cuidados existe para fazer. E o mês de 2026, já fechado e reportado, ganharia
-- uma decisão nova.
--
-- ⚠️ A saída NÃO é mexer no SLA: `data_culto` é lida em ~112 pontos do sistema
-- (dashboards, coortes, agentes, filtros). Mexer nela seria caro e arriscado.
-- Em vez disso, a decisão passa a poder dizer QUANDO a jornada começa, e as
-- 112 réguas seguem funcionando sem uma linha alterada.
--
-- Decisão do Matheus: "essas aceitações em vídeos antigos não entram na mesma
-- régua de contato pastoral... ali vai mostrar quando a pessoa preencheu o
-- formulário e aí sim contabiliza o tempo para o contato pastoral, deve mostrar
-- também de qual culto ela veio."

ALTER TABLE public.cultos_decisoes_pessoas
  ADD COLUMN IF NOT EXISTS decidiu_em date;

COMMENT ON COLUMN public.cultos_decisoes_pessoas.decidiu_em IS
  'Data em que a PESSOA decidiu, quando difere da data do culto (replay de vídeo antigo). NULL = decidiu no próprio culto, comportamento de sempre. É esta data que inicia a jornada pastoral; `culto_id` continua guardando de qual culto/vídeo ela veio. Derivar "veio de vídeo passado" = decidiu_em IS NOT NULL.';

-- ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA, nunca colagem do repo. Esta
-- função foi reescrita em produção mais de uma vez (área da decisão, guarda do
-- Kids, dedup por nome) e recolar o corpo do arquivo reverteria em silêncio o
-- que só existe no banco. É a lei registrada no CLAUDE.md.
DO $$
DECLARE
  v_def text;
  v_novo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tg_cultos_dec_pessoas_to_cuidados';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'tg_cultos_dec_pessoas_to_cuidados nao existe — abortando';
  END IF;

  -- Idempotência: já aplicado, não faz nada.
  IF position('NEW.decidiu_em' in v_def) > 0 THEN
    RAISE NOTICE 'ja aplicado — nada a fazer';
    RETURN;
  END IF;

  -- A âncora precisa existir EXATAMENTE uma vez, senão abortamos em vez de
  -- adivinhar qual ocorrência trocar.
  IF (length(v_def) - length(replace(v_def, '(v_data_culto, NEW.culto_id', ''))) / length('(v_data_culto, NEW.culto_id') <> 1 THEN
    RAISE EXCEPTION 'ancora do INSERT nao encontrada exatamente 1x — a definicao viva mudou';
  END IF;

  v_novo := replace(
    v_def,
    '(v_data_culto, NEW.culto_id',
    '(COALESCE(NEW.decidiu_em, v_data_culto), NEW.culto_id'
  );

  -- O dedup por nome também passa a comparar com a data efetiva, senão a mesma
  -- pessoa poderia entrar duas vezes ao rever o vídeo.
  v_novo := replace(
    v_novo,
    'AND cv.data_culto = v_data_culto',
    'AND cv.data_culto = COALESCE(NEW.decidiu_em, v_data_culto)'
  );

  EXECUTE v_novo;
END $$;
