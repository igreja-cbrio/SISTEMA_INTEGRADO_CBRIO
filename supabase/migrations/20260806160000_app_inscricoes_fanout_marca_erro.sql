-- ============================================================================
-- 2026-08-06 · O FANOUT PARA DE DIZER "processado" QUANDO A GRAVAÇÃO FALHOU
-- Auditoria do app · Onda 1, item 1
-- ============================================================================
--
-- O QUE ESTAVA ABERTO
-- -------------------
-- `fn_app_inscricoes_fanout` (trigger AFTER INSERT em `app_inscricoes`) tem, nos
-- 4 ramos (voluntariado · grupos · batismo · next), um
-- `EXCEPTION WHEN OTHERS THEN RAISE WARNING`, e a ÚLTIMA linha faz
-- `UPDATE app_inscricoes SET status = 'processado'` **incondicionalmente**.
-- Ou seja: gravação de destino que falha vira "processado", a pessoa recebe
-- "inscrição enviada" (e até WhatsApp de confirmação), e **não existe pedido em
-- nenhuma fila**. Ninguém reclama porque ninguém sabe que faltou — o motivo real
-- fica num WARNING do Postgres que nada monitora.
--
-- Vítima medida na auditoria: `app_inscricoes` tipo=grupos de 11/06 está
-- `processado` e `mem_grupo_pedidos` não tem NENHUMA linha `origem='app'` daquela
-- data (a causa de origem era o CHECK de `origem`, corrigido só em 28/07 — mas o
-- que fez a perda ser SILENCIOSA foi este carimbo).
--
-- O QUE ESTA MIGRATION FAZ
-- ------------------------
-- 1. amplia o CHECK de `app_inscricoes.status` pra aceitar **'erro'** — derivando
--    a lista dos valores VIVOS, nunca reescrevendo com uma lista decorada;
-- 2. **patcha a função DINAMICAMENTE** (pg_get_functiondef + regexp_replace), a
--    técnica da casa (20260722250000 / 20260729060000), com verificação de cada
--    substituição.
--
-- ⚠️⚠️ POR QUE PATCH DINÂMICO E NÃO `CREATE OR REPLACE` DO ARQUIVO: a definição
-- VIVA não é a do repo. A `20260729060000` reescreveu o corpo em produção (dedup
-- de voluntariado passou a filtrar `vi.deleted_at IS NULL`) exatamente por este
-- método; colar o corpo do arquivo aqui **REVERTERIA aquele patch em silêncio**.
-- Isto está registrado no CLAUDE.md como o motivo de o fanout ter ficado sem
-- conserto até hoje.
--
-- ⚠️⚠️ ORDEM É OBRIGATÓRIA: o CHECK aceitar 'erro' vem ANTES de a função gravar
-- 'erro'. Se a função gravasse 'erro' num CHECK que não aceita, o UPDATE
-- levantaria 23514 **dentro de um trigger AFTER INSERT — o que ABORTA o INSERT**:
-- a pessoa deixaria de conseguir se inscrever. A parte 2 confere isso e ABORTA
-- se a parte 1 não tiver valido (protege contra colagem parcial).
--
-- ⚠️ O motivo do erro é guardado SEM texto livre: só `SQLSTATE` e o **nome da
-- constraint** (via GET STACKED DIAGNOSTICS). O SQLERRM do Postgres embute o
-- valor que violou a chave ("Key (cpf)=(...) already exists"), e a linha é
-- LEGÍVEL pelo próprio dono via RLS — não é lugar de PII. Quem tem o texto
-- completo é o WARNING no log.
--
-- ⚠️ O motivo vai em COLUNA PRÓPRIA (`fanout_erro` jsonb), não dentro de `dados`:
-- `dados` é o payload que a PESSOA enviou, a fila do Cuidados o exibe, e
-- `cuidados.js` reescreve `dados` inteiro em algumas ações — o diagnóstico
-- desapareceria sem ninguém notar.
--
-- ⚠️⚠️ E o carimbo novo roda dentro do PRÓPRIO sub-bloco de exceção: se por
-- qualquer motivo gravar 'erro' falhar (CHECK ausente num ambiente, coluna
-- ausente), ele **cai no comportamento antigo** em vez de derrubar o INSERT.
-- Cinto e suspensório de propósito: o pior caso deste conserto não pode ser "a
-- pessoa não consegue se inscrever".
--
-- ⚠️ IDEMPOTENTE nas três partes.
-- ============================================================================
SET lock_timeout = '10s';

-- ── PARTE 0 · coluna do diagnóstico ─────────────────────────────────────────
ALTER TABLE public.app_inscricoes
  ADD COLUMN IF NOT EXISTS fanout_erro jsonb;

COMMENT ON COLUMN public.app_inscricoes.fanout_erro IS
  'Diagnóstico do fanout quando status=''erro'': {sqlstate, constraint, em}. '
  'SEM texto livre (SQLERRM embute valor de chave = PII); a mensagem completa '
  'fica no WARNING do log. Auditoria 06/08/2026.';

-- ── PARTE 1 · o CHECK de status passa a aceitar 'erro' ──────────────────────
DO $$
DECLARE
  v_nome   text;
  v_def    text;
  v_vals   text[];
  v_lista  text;
BEGIN
  -- Nome do CHECK vem do CATÁLOGO, não decorado (a 20260609120000 já renomeou
  -- esta constraint uma vez; assumir o nome é como se dropa a errada).
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO v_nome, v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.app_inscricoes'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
    AND pg_get_constraintdef(c.oid) LIKE '%pendente%'
  LIMIT 1;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'CHECK de app_inscricoes.status não encontrado no catálogo — revisar antes de aplicar';
  END IF;

  IF v_def LIKE '%''erro''%' THEN
    RAISE NOTICE 'PARTE 1: CHECK % já aceita erro', v_nome;
  ELSE
    -- ⚠️ A lista nova é DERIVADA da viva: extrai os literais do
    -- `pg_get_constraintdef` e acrescenta 'erro'. Escrever a lista à mão
    -- estreitaria o CHECK em silêncio se produção tiver algum valor que o repo
    -- não conhece — e aí o próximo INSERT com aquele valor passaria a falhar.
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
      INTO v_vals
    FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') AS m;

    IF v_vals IS NULL OR array_length(v_vals, 1) < 4 THEN
      RAISE EXCEPTION 'PARTE 1: não consegui extrair os valores do CHECK vivo (%) — revisar à mão', v_def;
    END IF;

    v_vals := array_append(v_vals, 'erro'::text);  -- NUNCA `arr || 'literal'` (22P02)
    SELECT string_agg(format('%L', v), ', ' ORDER BY v) INTO v_lista FROM unnest(v_vals) AS v;

    EXECUTE format('ALTER TABLE public.app_inscricoes DROP CONSTRAINT %I', v_nome);
    EXECUTE format(
      'ALTER TABLE public.app_inscricoes ADD CONSTRAINT %I CHECK (status IN (%s))',
      v_nome, v_lista
    );
    RAISE NOTICE 'PARTE 1: CHECK % agora aceita: %', v_nome, v_lista;
  END IF;
END $$;

-- ── PARTE 2 · a função marca 'erro' quando um ramo falhou ───────────────────
DO $$
DECLARE
  src   text;
  novo  text;
  n_war int;
BEGIN
  -- Guarda: sem o CHECK da parte 1, gravar 'erro' abortaria o INSERT da pessoa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.app_inscricoes'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%status%'
       AND pg_get_constraintdef(c.oid) LIKE '%''erro''%'
  ) THEN
    RAISE EXCEPTION 'PARTE 2 abortada: o CHECK de status ainda não aceita ''erro''. Rodar a PARTE 1 primeiro (senão o trigger aborta o INSERT da pessoa).';
  END IF;

  src := pg_get_functiondef('public.fn_app_inscricoes_fanout()'::regprocedure);

  IF src LIKE '%v_falhou%' THEN
    RAISE NOTICE 'PARTE 2: fanout já marca erro (patch aplicado)';
    RETURN;
  END IF;

  -- Âncoras esperadas no corpo VIVO. Se qualquer uma faltar, aborta: nunca
  -- aplicar patch parcial numa função que decide inscrição de gente.
  IF src NOT LIKE '%d jsonb := COALESCE(NEW.dados%' THEN
    RAISE EXCEPTION 'PARTE 2: DECLARE vivo não tem a âncora esperada — revisar pg_get_functiondef';
  END IF;
  IF src NOT LIKE '%SET status = ''processado'' WHERE id = NEW.id AND status = ''pendente''%' THEN
    RAISE EXCEPTION 'PARTE 2: o UPDATE final vivo não tem o texto esperado — revisar pg_get_functiondef';
  END IF;

  SELECT count(*) INTO n_war
  FROM regexp_matches(src, 'RAISE WARNING ''\[app_inscricoes_fanout', 'g');
  IF n_war < 4 THEN
    RAISE EXCEPTION 'PARTE 2: esperava >= 4 ramos com RAISE WARNING, achei % — revisar', n_war;
  END IF;

  -- (a) variáveis de estado do ramo
  novo := regexp_replace(
    src,
    '(d jsonb := COALESCE\(NEW\.dados, ''\{\}''::jsonb\);)',
    E'\\1\n  v_falhou boolean := false;\n  v_erro text;\n  v_constr text;',
    ''
  );

  -- (b) todo ramo que engolia a exceção agora REGISTRA que falhou.
  -- GET STACKED DIAGNOSTICS só é válido dentro de handler de exceção — que é
  -- exatamente onde estas linhas estão. Guarda SQLSTATE + nome da constraint:
  -- diagnóstico útil, zero texto livre (a mensagem segue no WARNING do log).
  novo := regexp_replace(
    novo,
    '(RAISE WARNING ''\[app_inscricoes_fanout)',
    'v_falhou := true; GET STACKED DIAGNOSTICS v_erro = RETURNED_SQLSTATE, v_constr = CONSTRAINT_NAME; \1',
    'g'
  );

  -- (c) o carimbo final deixa de mentir — dentro do PRÓPRIO sub-bloco de
  -- exceção: se gravar 'erro' falhar (CHECK/coluna ausentes em algum ambiente),
  -- cai no comportamento antigo em vez de abortar o INSERT da pessoa.
  novo := replace(
    novo,
    'UPDATE public.app_inscricoes SET status = ''processado'' WHERE id = NEW.id AND status = ''pendente'';',
    'BEGIN'
    || ' UPDATE public.app_inscricoes SET'
    || '   status = CASE WHEN v_falhou THEN ''erro'' ELSE ''processado'' END,'
    || '   fanout_erro = CASE WHEN v_falhou THEN jsonb_build_object('
    || '     ''sqlstate'', v_erro, ''constraint'', v_constr, ''em'', now()) ELSE NULL END'
    || ' WHERE id = NEW.id AND status = ''pendente'';'
    || ' EXCEPTION WHEN OTHERS THEN'
    || '   RAISE WARNING ''[app_inscricoes_fanout carimbo] %'', SQLERRM;'
    || '   UPDATE public.app_inscricoes SET status = ''processado'' WHERE id = NEW.id AND status = ''pendente'';'
    || ' END;'
  );

  -- Verificação de cada substituição (replace que não casou é o modo silencioso
  -- de estragar: a função seria recriada IGUAL e ninguém notaria).
  IF novo NOT LIKE '%v_falhou boolean := false;%' THEN
    RAISE EXCEPTION 'PARTE 2: (a) declaração de v_falhou não entrou';
  END IF;
  IF novo NOT LIKE '%GET STACKED DIAGNOSTICS v_erro%' THEN
    RAISE EXCEPTION 'PARTE 2: (b) captura do erro nos ramos não entrou';
  END IF;
  IF novo NOT LIKE '%CASE WHEN v_falhou THEN ''erro''%' THEN
    RAISE EXCEPTION 'PARTE 2: (c) carimbo condicional não entrou';
  END IF;

  EXECUTE novo;
  RAISE NOTICE 'PARTE 2: fanout agora marca erro (% ramos instrumentados)', n_war;
END $$;

COMMENT ON FUNCTION public.fn_app_inscricoes_fanout() IS
  'Fanout de app_inscricoes pros destinos (voluntariado/grupos/batismo/next). '
  'Ramo que falha marca status=''erro'' com SQLSTATE + constraint em dados '
  '(auditoria 06/08/2026) — antes carimbava ''processado'' e a inscrição se '
  'perdia em silêncio. Patch DINÂMICO: NUNCA recriar do arquivo do repo, que '
  'reverteria o patch de dedup da 20260729060000.';

-- ── Conferência (rodar DEPOIS · o SQL Editor não mostra RAISE NOTICE) ────────
-- ⚠️ Casa texto no corpo SEM COMENTÁRIO (o `pg_get_functiondef` devolve os
-- comentários, e foi assim que a conferência da 20260806140000 deu falso
-- positivo hoje).
--
--    with d as (
--      select regexp_replace(
--               pg_get_functiondef('public.fn_app_inscricoes_fanout()'::regprocedure),
--               '--[^\n]*', '', 'g') as f
--    )
--    select
--      (f like '%v_falhou boolean := false;%')::int          as tem_flag,            -- 1
--      (f like '%GET STACKED DIAGNOSTICS%')::int             as captura_erro,        -- 1
--      (f like '%CASE WHEN v_falhou THEN ''erro''%')::int    as carimbo_condicional, -- 1
--      (f like '%[app_inscricoes_fanout carimbo]%')::int     as fallback_do_carimbo, -- 1
--      (f like '%vi.deleted_at IS NULL%')::int               as patch_2907_intacto   -- 1 (não reverteu!)
--    from d;
--
-- 3) a coluna do diagnóstico existe:
--    select column_name, data_type from information_schema.columns
--     where table_schema='public' and table_name='app_inscricoes' and column_name='fanout_erro';
--
-- E o CHECK:
--    select pg_get_constraintdef(c.oid) from pg_constraint c
--     where c.conrelid = 'public.app_inscricoes'::regclass and c.contype = 'c'
--       and pg_get_constraintdef(c.oid) like '%pendente%';
--    -- deve conter 'erro'
