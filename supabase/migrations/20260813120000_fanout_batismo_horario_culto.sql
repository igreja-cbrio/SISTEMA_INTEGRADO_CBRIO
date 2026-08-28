-- ============================================================================
-- Batismo pelo APP passa a gravar o HORÁRIO escolhido
-- 2026-08-13
--
-- Pedido do Marcos: "no app de membros, na inscrição de batismo, tenha a mesma
-- opção de escolher os horários abertos que tem no formulário de inscrição".
--
-- O app manda `dados.horario_culto`, o backend valida pela régua ÚNICA
-- (`utils/batismoHorario` + `services/batismoHorarios`) — mas o fan-out
-- (`fn_app_inscricoes_fanout`) NÃO copiava o campo pro INSERT em
-- `batismo_inscricoes`. Sem esta migration o horário é validado e **descartado
-- em silêncio**: a pessoa escolhe 08:30 e a equipe recebe a inscrição sem
-- horário nenhum. É a mesma classe do CPF do censo (04/08).
--
-- ⚠️⚠️ PATCH DINÂMICO OBRIGATÓRIO (pg_get_functiondef + replace), a técnica de
-- 20260729060000 / 20260806160000. A definição VIVA desta função NÃO é a do
-- repo — ela foi reescrita em produção pelo menos duas vezes (o
-- `vi.deleted_at IS NULL` do dedup de voluntariado em 29/07 e o carimbo de
-- 'erro' + `fanout_erro` em 06/08). Um `CREATE OR REPLACE` a partir de arquivo
-- REVERTERIA aquilo em silêncio.
--
-- A migration ABORTA se qualquer âncora não casar EXATAMENTE uma vez.
-- ============================================================================

DO $mig$
DECLARE
  v_def   text;
  v_novo  text;
  v_col   constant text := E'         observacoes, area_kpi)';
  v_val   constant text := E'         NULLIF(btrim(COALESCE(d->>''observacoes'','''')),''''),\n         ''sede'');';
BEGIN
  -- Pré-requisito: a coluna destino existe (o formulário público já grava nela).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'batismo_inscricoes'
       AND column_name  = 'horario_culto'
  ) THEN
    RAISE EXCEPTION 'batismo_inscricoes.horario_culto não existe — abortando';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_app_inscricoes_fanout';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fn_app_inscricoes_fanout não encontrada — abortando';
  END IF;

  -- Idempotência: se já foi aplicada, sai sem tocar em nada.
  IF position('horario_culto' in v_def) > 0 THEN
    RAISE NOTICE 'fanout já grava horario_culto — nada a fazer';
    RETURN;
  END IF;

  -- ⚠️ Âncoras conferidas na definição VIVA em 13/08: 1 ocorrência cada.
  -- Contar ANTES de substituir é o que impede o patch de acertar o ramo errado
  -- (o `'sede')` sozinho aparece 2× no corpo — por isso a âncora do VALUES leva
  -- a linha do `observacoes` junto).
  IF (length(v_def) - length(replace(v_def, v_col, ''))) / length(v_col) <> 1 THEN
    RAISE EXCEPTION 'âncora da lista de colunas não casou exatamente 1× — abortando';
  END IF;
  IF (length(v_def) - length(replace(v_def, v_val, ''))) / length(v_val) <> 1 THEN
    RAISE EXCEPTION 'âncora do VALUES não casou exatamente 1× — abortando';
  END IF;

  v_novo := replace(v_def, v_col, E'         observacoes, area_kpi, horario_culto)');
  v_novo := replace(
    v_novo,
    v_val,
    E'         NULLIF(btrim(COALESCE(d->>''observacoes'','''')),''''),\n'
    || E'         ''sede'',\n'
    -- Teto de 80 chars = o mesmo do `normalizarHorario` (utils/batismoHorario).
    -- Bundle antigo não manda o campo ⇒ NULL, exatamente o de hoje.
    || E'         NULLIF(btrim(left(COALESCE(d->>''horario_culto'',''''), 80)),''''));'
  );

  IF v_novo = v_def THEN
    RAISE EXCEPTION 'substituição não alterou o corpo — abortando';
  END IF;

  EXECUTE v_novo;
  RAISE NOTICE 'fn_app_inscricoes_fanout: horario_culto ligado no ramo batismo';
END
$mig$;
