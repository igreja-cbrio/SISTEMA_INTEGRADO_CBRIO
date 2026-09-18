-- ─────────────────────────────────────────────────────────────────────────────
-- Próximos passos · status novo "contactada" no 1º contato (Marcelo · 2026-09-01)
--
-- Contexto: o Marcelo manda a mensagem SEMPRE no dia seguinte ao culto, mas só
-- marcava o status quando a pessoa respondia — o carimbo de primeiro_contato_em
-- saía dias depois e bagunçava o KPI de contato ≤3d. "contactada" = a mensagem
-- foi enviada e a pessoa ainda não respondeu (conta como contato FEITO).
--
-- ⚠️ O CHECK vivo (cui_convertidos_primeiro_contato_status_check) recusa o valor
-- novo — provado em produção em 01/09 (23514). Este patch é DINÂMICO sobre a
-- definição VIVA (pg_get_constraintdef): lista estática num ADD CONSTRAINT seria
-- remoção silenciosa de valor que entrou fora do git (lei da whitelist · 17/08).
-- Idempotente: se 'contactada' já está no CHECK, não toca em nada.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def  text;
  v_nova text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.cui_convertidos'::regclass
    AND conname  = 'cui_convertidos_primeiro_contato_status_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CHECK cui_convertidos_primeiro_contato_status_check não encontrado — abortando (não recriar às cegas)';
  END IF;

  IF v_def ILIKE '%contactada%' THEN
    RAISE NOTICE 'contactada já está no CHECK — nada a fazer';
    RETURN;
  END IF;

  -- Injeta o valor novo preservando a forma viva. Guarda: exatamente 1 ARRAY[
  -- (mais de um significa que a forma mudou e o patch cego erraria).
  IF (length(v_def) - length(replace(v_def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 THEN
    RAISE EXCEPTION 'forma inesperada do CHECK (esperava exatamente 1 ARRAY[): %', v_def;
  END IF;

  v_nova := replace(v_def, 'ARRAY[', 'ARRAY[''contactada''::text, ');

  EXECUTE 'ALTER TABLE public.cui_convertidos DROP CONSTRAINT cui_convertidos_primeiro_contato_status_check';
  EXECUTE 'ALTER TABLE public.cui_convertidos ADD CONSTRAINT cui_convertidos_primeiro_contato_status_check ' || v_nova;

  RAISE NOTICE 'CHECK atualizado: %', v_nova;
END $$;

COMMENT ON COLUMN public.cui_convertidos.primeiro_contato_status IS
  'Status do 1º contato (Próximos passos). "contactada" (2026-09-01) = mensagem enviada, aguardando resposta — conta como contato FEITO e carimba primeiro_contato_em. Espelhos da régua CONTATO_FEITO: routes/cuidados.js · routes/painel.js · routes/nextConvite.js · services/agentePrimeiroContato.js · Cuidados.tsx.';
