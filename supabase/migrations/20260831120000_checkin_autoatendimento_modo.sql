-- ============================================================================
-- 2026-08-31 · CHECK-IN por AUTOATENDIMENTO (QR na porta) devolvia 500 sempre
-- ============================================================================
--
-- O QUE ESTAVA QUEBRADO
-- ----------------------
-- `routes/publicEventoCheckin.js` (2026-08-28 · autoatendimento por CPF+nascimento
-- ou nome+telefone na porta do evento) chama `marcarCheckinAuditavel({..., modo:
-- 'autoatendimento'})`, que faz `supabase.rpc('fn_insc_checkin_marcar', {p_modo:
-- 'autoatendimento', ...})`.
--
-- A função (20260729090000) tem:
--   IF p_modo NOT IN ('busca','qr') THEN RAISE EXCEPTION 'modo de check-in inválido';
-- 'autoatendimento' NUNCA foi incluído ali — a porta de autoatendimento nasceu
-- DEPOIS da função e ninguém atualizou a whitelist do modo. Resultado: TODA
-- confirmação de check-in por QR na porta bate 500 ([P0001] modo de check-in
-- inválido), sempre, sem exceção — é o padrão visto no monitor de erros
-- (POST /api/public/evento-checkin/:token/confirmar, repetido).
--
-- `insc_checkins.modo` e `insc_checkin_eventos.modo` também têm CHECK
-- (modo IN ('busca','qr')): mesmo se a função aceitasse o valor, o INSERT
-- estouraria 23514 na hora de gravar.
--
-- ⚠️ ORDEM: os DOIS CHECKs entram ANTES do patch da função. Se a função
-- gravasse 'autoatendimento' num CHECK que não aceita, o INSERT dentro dela
-- levantaria 23514 e a exceção subiria pro chamador — mesmo sintoma (500),
-- causa diferente. A parte 2 confere os dois CHECKs e ABORTA se algum não
-- tiver valido, pra nunca aplicar patch parcial numa função que decide
-- check-in de gente na porta do evento.
--
-- ⚠️⚠️ CHECK das duas tabelas: lista DERIVADA da constraint viva, nunca
-- reescrita decorada (lição do CHECK de app_inscricoes · 06/08) — se prod
-- tiver algum modo que o repo não conhece, esta migration não o apaga.
--
-- ⚠️⚠️ FUNÇÃO: patch DINÂMICO sobre `pg_get_functiondef`, nunca
-- `CREATE OR REPLACE` a partir do corpo do arquivo do repo. Este checkout
-- está atrasado em relação a origin/main (o próprio arquivo
-- routes/publicEventoCheckin.js só existe lá) — colar um corpo estático
-- arriscaria reverter em silêncio qualquer ajuste que produção já tenha
-- recebido fora deste branch. A lista de modos aceitos é extraída de dentro
-- do `p_modo NOT IN (...)` vivo e só recebe o valor novo.
--
-- ⚠️ IDEMPOTENTE nas três partes.
-- ============================================================================

-- ── PARTE 1 · os dois CHECKs de `modo` passam a aceitar 'autoatendimento' ───
DO $$
DECLARE
  v_tabela   text;
  v_nome     text;
  v_def      text;
  v_valores  text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['insc_checkins', 'insc_checkin_eventos']
  LOOP
    SELECT c.conname, pg_get_constraintdef(c.oid)
      INTO v_nome, v_def
      FROM pg_constraint c
     WHERE c.conrelid = ('public.' || v_tabela)::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%modo%'
     LIMIT 1;

    IF v_nome IS NULL THEN
      RAISE EXCEPTION 'PARTE 1: CHECK de modo não encontrado em public.% — abortando (não vou criar um do zero e estreitar valores que existem em prod)', v_tabela;
    END IF;

    IF v_def ILIKE '%autoatendimento%' THEN
      RAISE NOTICE 'PARTE 1: % já aceita autoatendimento em % — nada a fazer', v_nome, v_tabela;
      CONTINUE;
    END IF;

    v_valores := substring(v_def from 'IN \((.*?)\)');
    IF v_valores IS NULL THEN
      RAISE EXCEPTION 'PARTE 1: não consegui ler os valores do CHECK % em % (%)', v_nome, v_tabela, v_def;
    END IF;
    v_valores := replace(v_valores, '::text', '');

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tabela, v_nome);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (modo IN (%s, ''autoatendimento''))',
      v_tabela, v_nome, v_valores
    );
    RAISE NOTICE 'PARTE 1: CHECK % (%) recriado com autoatendimento. Valores antes: %', v_nome, v_tabela, v_valores;
  END LOOP;
END $$;

-- ── PARTE 2 · fn_insc_checkin_marcar passa a aceitar 'autoatendimento' ──────
DO $$
DECLARE
  v_src    text;
  v_novo   text;
  v_dentro text;
  v_vals   text[];
  v_lista  text;
BEGIN
  -- Guarda: sem a PARTE 1, gravar 'autoatendimento' abortaria o INSERT com
  -- 23514 dentro da própria função — mesmo sintoma (500), causa nova.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.insc_checkins'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%modo%'
       AND pg_get_constraintdef(c.oid) NOT ILIKE '%autoatendimento%'
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.insc_checkin_eventos'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%modo%'
       AND pg_get_constraintdef(c.oid) NOT ILIKE '%autoatendimento%'
  ) THEN
    RAISE EXCEPTION 'PARTE 2 abortada: algum CHECK de modo ainda não aceita ''autoatendimento''. Rodar a PARTE 1 primeiro.';
  END IF;

  v_src := pg_get_functiondef('public.fn_insc_checkin_marcar(uuid, uuid, text, boolean, text)'::regprocedure);

  -- Casa fora de comentário — comentário citando 'autoatendimento' já daria
  -- falso positivo (armadilha registrada em 06/08 e 06/08-2ª leva).
  IF regexp_replace(v_src, '--[^\n]*', '', 'g') ILIKE '%autoatendimento%' THEN
    RAISE NOTICE 'PARTE 2: fn_insc_checkin_marcar já aceita autoatendimento — nada a fazer';
    RETURN;
  END IF;

  v_dentro := substring(v_src from 'p_modo NOT IN \(([^)]*)\)');
  IF v_dentro IS NULL THEN
    RAISE EXCEPTION 'PARTE 2: não encontrei "p_modo NOT IN (...)" no corpo vivo — revisar pg_get_functiondef antes de aplicar';
  END IF;

  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_vals
    FROM regexp_matches(v_dentro, '''([^'']+)''', 'g') AS m;

  IF v_vals IS NULL OR array_length(v_vals, 1) < 2 THEN
    RAISE EXCEPTION 'PARTE 2: não consegui extrair os modos do corpo vivo: %', v_dentro;
  END IF;

  IF 'autoatendimento' = ANY(v_vals) THEN
    RAISE NOTICE 'PARTE 2: autoatendimento já está na lista viva (%) — nada a fazer', v_vals;
    RETURN;
  END IF;

  v_vals := array_append(v_vals, 'autoatendimento'::text);  -- NUNCA `arr || 'literal'` (22P02)
  SELECT string_agg(format('%L', v), ',' ORDER BY v) INTO v_lista FROM unnest(v_vals) AS v;

  v_novo := replace(
    v_src,
    format('p_modo NOT IN (%s)', v_dentro),
    format('p_modo NOT IN (%s)', v_lista)
  );

  IF v_novo = v_src THEN
    RAISE EXCEPTION 'PARTE 2: substituição não teve efeito — a âncora "p_modo NOT IN (%s)" não casou com o corpo vivo', v_dentro;
  END IF;

  EXECUTE v_novo;
  RAISE NOTICE 'PARTE 2: fn_insc_checkin_marcar agora aceita: %', v_lista;
END $$;

COMMENT ON FUNCTION public.fn_insc_checkin_marcar(uuid, uuid, text, boolean, text) IS
  'Marca check-in de inscrição (SPEC-06/F3.4). p_modo aceita busca, qr e '
  'autoatendimento (o self check-in por QR da porta, routes/publicEventoCheckin.js, '
  '2026-08-28) — sem este valor a porta de autoatendimento respondia 500 sempre '
  '([P0001] modo de check-in inválido). Corrigido 31/08/2026. Patch DINÂMICO: '
  'NUNCA recriar do corpo estático do arquivo da migration 20260729090000.';

-- ── Conferência (rodar DEPOIS · o SQL Editor não mostra RAISE NOTICE) ────────
--
--   select pg_get_constraintdef(c.oid) from pg_constraint c
--    where c.conrelid = 'public.insc_checkins'::regclass and c.contype = 'c'
--      and pg_get_constraintdef(c.oid) ilike '%modo%';
--   -- deve conter 'autoatendimento'
--
--   select pg_get_constraintdef(c.oid) from pg_constraint c
--    where c.conrelid = 'public.insc_checkin_eventos'::regclass and c.contype = 'c'
--      and pg_get_constraintdef(c.oid) ilike '%modo%';
--   -- deve conter 'autoatendimento'
--
--   select regexp_replace(pg_get_functiondef('public.fn_insc_checkin_marcar(uuid,uuid,text,boolean,text)'::regprocedure), '--[^\n]*', '', 'g') ilike '%autoatendimento%';
--   -- true
--
-- Teste funcional (transação revertida, não deixa resíduo):
--   BEGIN;
--     -- pegar uma inscrição viva qualquer de um evento com checkin_ativo=true e status <> 'cancelada'/'recebida'
--     SELECT public.fn_insc_checkin_marcar(
--       p_inscricao_id := '<uuid de uma inscrição de teste>',
--       p_por := null,
--       p_modo := 'autoatendimento',
--       p_override_pendente := false,
--       p_override_motivo := null
--     );
--     -- espera-se {"ok": true, "ja_checkin": false, "em": "..."} — sem exceção
--   ROLLBACK;
