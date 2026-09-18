-- ════════════════════════════════════════════════════════════════════════════
--  CENSO vira PORTA de consentimento · 2026-09-13
--
--  Pedido do Matheus (13/09/2026), depois do censo de 12-13/09: o questionário
--  não tinha caixa de opt-in de WhatsApp, e por isso 385 pessoas ficaram sem
--  consentimento nenhum — o que travou aniversário e campanha para elas. A
--  caixa entrou no questionário; esta migration abre a porta no ledger para
--  que a resposta dela vire prova de verdade.
--
--  ⚠️⚠️ SEM ISTO O CONSENTIMENTO SOME EM SILÊNCIO. `registrarConsentimentos`
--  (services/inscricaoContrato.js) engole o erro do insert com console.error e
--  devolve `{ok:false}` — ninguém no caminho da pessoa vê nada. Um 23514 por
--  porta fora do CHECK seria exatamente a falha muda que este arquivo existe
--  para impedir.
--
--  ⚠️ `tipo` NÃO é tocado: `whatsapp`, `imagem` e `termos_lgpd` já estão no
--  CHECK vivo (conferido no catálogo em 13/09). Mexer nele sem necessidade é
--  risco de graça.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_def    TEXT;
  v_chaves TEXT;
  v_vals   TEXT[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'inscricao_consentimentos'
     AND c.conname = 'inscricao_consentimentos_porta_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'inscricao_consentimentos_porta_check não existe — o ledger mudou de forma, revisar antes de seguir';
  END IF;

  IF v_def LIKE '%''censo''%' THEN
    RAISE NOTICE 'porta censo já está no CHECK — nada a fazer';
    RETURN;
  END IF;

  -- ⚠️⚠️ DUAS FORMAS, e copiar só uma delas APAGA a lista.
  --
  -- A definição viva do CHECK pode estar em duas formas, dependendo de quem a
  -- escreveu por último:
  --   A) ARRAY['a'::text, 'b'::text]   ← literais individuais (é como `tipo` está)
  --   B) '{a,b,c}'::text[]             ← UM literal só, com vírgulas dentro
  --
  -- O precedente de 09/09 (visitantes) extraía literais com o regex
  -- '''([a-z_]+)''' — que casa na forma A e NÃO casa na forma B, porque depois
  -- da aspa vem `{`. E foi justamente aquela migration que reescreveu `porta`
  -- na forma B (ela grava com %L de um array). Ou seja: repetir o regex de lá
  -- hoje devolveria NULL, o array_append daria `{censo}`, e o CHECK passaria a
  -- aceitar SÓ `censo` — as 10 portas vivas viram 23514 na próxima inscrição.
  -- É a "remoção silenciosa disfarçada de acréscimo" da lei de 17/08, agora
  -- pela forma do literal em vez da lista escrita à mão.
  v_chaves := substring(v_def from '''\{([^}]*)\}''');
  IF v_chaves IS NOT NULL THEN
    SELECT array_agg(DISTINCT btrim(x) ORDER BY btrim(x)) INTO v_vals
      FROM unnest(string_to_array(v_chaves, ',')) AS x
     WHERE btrim(x) <> '';
  ELSE
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_vals
      FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  END IF;

  -- GUARDA: extração que não reconheceu a forma devolve pouco ou nada. Abortar
  -- alto é o único desfecho aceitável — aplicar assim seria apagar as portas.
  IF v_vals IS NULL OR array_length(v_vals, 1) < 5 THEN
    RAISE EXCEPTION 'não consegui ler as portas vivas do CHECK (def: %) — abortando para não apagar a lista', v_def;
  END IF;
  IF NOT (v_vals @> ARRAY['apresentacao','batismo','grupos','next','voluntariado']::TEXT[]) THEN
    RAISE EXCEPTION 'as portas lidas não contêm as conhecidas (%) — abortando', v_vals;
  END IF;

  v_vals := array_append(v_vals, 'censo');

  EXECUTE 'ALTER TABLE public.inscricao_consentimentos DROP CONSTRAINT inscricao_consentimentos_porta_check';
  EXECUTE format(
    'ALTER TABLE public.inscricao_consentimentos ADD CONSTRAINT inscricao_consentimentos_porta_check CHECK (porta = ANY (%L::text[]))',
    v_vals
  );
  RAISE NOTICE 'porta censo acrescentada · portas agora: %', v_vals;
END $$;

COMMENT ON COLUMN public.inscricao_consentimentos.porta IS
  'Por onde o consentimento foi coletado. ⚠️ Acrescentar valor aqui é SEMPRE patch dinâmico sobre a definição viva, com guarda que aborta — e o parser precisa tratar as DUAS formas do CHECK (ARRAY[''a''::text,...] e ''{a,b}''::text[]). Lista estática, ou regex que só casa uma forma, é remoção silenciosa disfarçada de acréscimo.';
