-- ─────────────────────────────────────────────────────────────────────────────
-- Próximos passos · status novo "contato_impossivel" (Marcelo · 2026-09-16)
--
-- Pedido do Marcelo, nas palavras do Marcos: *"existem pessoas do online que nós
-- temos apenas o id do youtube e o contato não é possível"*.
--
-- ⚠️⚠️ MEDIDO ANTES DE MEXER: o caso JÁ está na base, e marcado errado. Seis
-- linhas de 14/09, área `online`, com o NOME sendo o handle do YouTube
-- (`@leandrobeanes3264`, `@mimirivelli`…) e telefone de dígito repetido (falso),
-- todas em `contactada` — que conta como CONTATO FEITO em todos os espelhos.
-- Ou seja: o indicador de contato está contando 6 contatos que são impossíveis.
--
-- ⚠️ `contato_impossivel` NÃO conta como contato feito e NÃO carimba
-- `primeiro_contato_em`: nenhuma mensagem saiu, porque não há para onde mandar.
-- E, como o `numero_errado`, sai do DENOMINADOR do percentual de atendimento —
-- número que a equipe não tem como alcançar não pode ser cobrado dela.
--
-- ⚠️⚠️ NÃO confundir com `numero_errado`: lá existe um número e ele é de outra
-- pessoa. Aqui não existe número nenhum — existe um id de vídeo.
--
-- Patch DINÂMICO sobre a definição VIVA (mesma forma do 20260901130000, que
-- acrescentou `contactada`): lista estática num ADD CONSTRAINT seria remoção
-- silenciosa de valor que entrou fora do git. Idempotente.
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

  IF v_def ILIKE '%contato_impossivel%' THEN
    RAISE NOTICE 'contato_impossivel já está no CHECK — nada a fazer';
    RETURN;
  END IF;

  -- Guarda: exatamente 1 ARRAY[ (mais de um significa que a forma mudou e o
  -- patch cego erraria).
  IF (length(v_def) - length(replace(v_def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 THEN
    RAISE EXCEPTION 'forma inesperada do CHECK (esperava exatamente 1 ARRAY[): %', v_def;
  END IF;

  v_nova := replace(v_def, 'ARRAY[', 'ARRAY[''contato_impossivel''::text, ');

  EXECUTE 'ALTER TABLE public.cui_convertidos DROP CONSTRAINT cui_convertidos_primeiro_contato_status_check';
  EXECUTE 'ALTER TABLE public.cui_convertidos ADD CONSTRAINT cui_convertidos_primeiro_contato_status_check ' || v_nova;

  RAISE NOTICE 'CHECK atualizado: %', v_nova;
END $$;

COMMENT ON COLUMN public.cui_convertidos.primeiro_contato_status IS
  'Status do 1º contato (Próximos passos). "contactada" (2026-09-01) = mensagem enviada, aguardando resposta — conta como contato FEITO e carimba primeiro_contato_em. "contato_impossivel" (2026-09-16) = não há canal de contato (ex.: converso do online de quem só temos o id do YouTube) — NÃO conta como contato feito, não carimba primeiro_contato_em e sai do denominador do percentual de atendimento, como numero_errado. Espelhos da régua CONTATO_FEITO: routes/cuidados.js · routes/painel.js · routes/nextConvite.js · services/agentePrimeiroContato.js · src/lib/primeiroContato.ts.';

-- ── Conferência (rodar DEPOIS, no SQL Editor) ───────────────────────────────
-- select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'cui_convertidos_primeiro_contato_status_check';
-- -- as 6 linhas do YouTube que hoje estão como "contactada":
-- select id, nome, telefone, primeiro_contato_status from public.cui_convertidos
--   where deleted_at is null and area = 'online' and nome like '@%';
