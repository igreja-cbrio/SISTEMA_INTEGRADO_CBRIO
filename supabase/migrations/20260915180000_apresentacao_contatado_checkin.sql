-- ============================================================================
-- Apresentação de crianças · status "contatado" + CHECK-IN do dia (Kids)
-- 2026-09-15 · pedido do Marcos (via Milena)
--
--   "colocar uma opção ali na área do kids como CONTATADO para saber quem nós
--    já entramos em contato, pode ser no mesmo menu, apenas adicionar uma
--    opção a mais"
--   "criar uma lógica de CHECK-IN ali, no dia a Milena poder marcar quem foi,
--    para saber se já foi entregue o kit"
--
-- ⚠️⚠️ SÃO DUAS PERGUNTAS DIFERENTES, e por isso são dois campos:
--   • `status` é o CICLO DE VIDA da inscrição (pendente → contatado →
--     confirmado → realizado/cancelado) e vale pra TURMA inteira;
--   • `presente_em` é o FATO DO DIA, por família. `status='realizado'` já é
--     carimbado no lote depois da cerimônia (medido em 15/09: as 14 linhas de
--     13/09 estão 'realizado'), então usá-lo como check-in diria que TODO
--     mundo veio — inclusive quem faltou. Granularidades diferentes.
-- ============================================================================

-- ── 1 · `contatado` no CHECK de status ──────────────────────────────────────
-- ⚠️⚠️ A lista é DERIVADA da definição VIVA, nunca escrita à mão: o CHECK pode
-- ter ganho valor fora do git, e lista estática num DROP+ADD é remoção
-- silenciosa disfarçada de acréscimo (a lei do `app_soft_deletable_tables`).
-- ⚠️ Continua NOT VALID de propósito (decisão de 28/07): vale pra escrita nova
-- e não valida as linhas antigas, que o PATCH histórico aceitava cruas.
DO $$
DECLARE
  v_def  text;
  v_vals text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'chk_apres_status'
     AND conrelid = 'public.apresentacao_criancas'::regclass;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'chk_apres_status não existe — conferir o catálogo antes de seguir';
  END IF;

  IF v_def ILIKE '%contatado%' THEN
    RAISE NOTICE 'chk_apres_status já aceita "contatado" — nada a fazer';
  ELSE
    SELECT array_agg(m[1] ORDER BY ord) INTO v_vals
      FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY AS t(m, ord);

    IF v_vals IS NULL OR array_length(v_vals, 1) < 1 THEN
      RAISE EXCEPTION 'não consegui derivar a lista viva de chk_apres_status: %', v_def;
    END IF;

    v_vals := v_vals || 'contatado'::text;

    ALTER TABLE public.apresentacao_criancas DROP CONSTRAINT chk_apres_status;
    EXECUTE format(
      'ALTER TABLE public.apresentacao_criancas ADD CONSTRAINT chk_apres_status CHECK (status = ANY (%L)) NOT VALID',
      v_vals);
    RAISE NOTICE 'chk_apres_status agora aceita: %', v_vals;
  END IF;
END $$;

-- ── 2 · a view unificada precisa saber o que é "contatado" ──────────────────
-- ⚠️⚠️ `vw_inscricoes_unificadas` tem `ELSE 'confirmada'` no CASE do status:
-- sem este patch, a família apenas CONTATADA apareceria em /inscricoes como
-- "confirmada" — número na tela afirmando o que ninguém confirmou.
-- ⚠️ Patch DINÂMICO sobre a definição VIVA: a view foi recriada por 5
-- migrations depois da original, e colar o corpo do repo reverteria em
-- silêncio o que só existe em produção.
-- ⚠️ O regexp casa os 4 ramos que mapeiam 'pendente'→'recebida'. Nos outros
-- (batismo, next…) o WHEN novo é INERTE — aquelas tabelas não têm o valor.
DO $$
DECLARE
  v_def  text;
  v_novo text;
  v_opts text[];
BEGIN
  SELECT pg_get_viewdef('public.vw_inscricoes_unificadas'::regclass, true) INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'vw_inscricoes_unificadas não existe';
  END IF;

  IF v_def ILIKE '%''contatado''%' THEN
    RAISE NOTICE 'vw_inscricoes_unificadas já mapeia "contatado" — nada a fazer';
  ELSE
    v_novo := regexp_replace(
      v_def,
      '(WHEN ''pendente''(::text)? THEN ''recebida''(::text)?)',
      E'\\1\n            WHEN ''contatado''::text THEN ''recebida''::text',
      'g');

    IF v_novo = v_def THEN
      RAISE EXCEPTION 'âncora não encontrada na definição VIVA da view — conferir pg_get_viewdef antes de seguir';
    END IF;

    -- ⚠️⚠️ Mudou o texto, mas mudou CERTO? Numa string E'' a referencia ao
    -- trecho casado seria lida como ESCAPE OCTAL (chr(1)) e nao como referencia:
    -- o CASE perderia o ramo WHEN 'pendente' e a inscricao recem-chegada
    -- apareceria como 'confirmada' em silencio. Dai a barra dobrada acima.
    IF v_novo !~ 'WHEN ''pendente''' OR strpos(v_novo, chr(1)) > 0 THEN
      RAISE EXCEPTION 'o patch corrompeu a definicao da view (ramo pendente perdido) - abortado';
    END IF;

    SELECT reloptions INTO v_opts
      FROM pg_class WHERE oid = 'public.vw_inscricoes_unificadas'::regclass;

    EXECUTE 'CREATE OR REPLACE VIEW public.vw_inscricoes_unificadas AS ' || v_novo;

    -- ⚠️ `CREATE OR REPLACE VIEW` preserva GRANTS mas não as reloptions
    -- (security_invoker, por exemplo) — reaplicadas aqui.
    IF v_opts IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.vw_inscricoes_unificadas SET (%s)',
                     array_to_string(v_opts, ', '));
    END IF;

    RAISE NOTICE 'vw_inscricoes_unificadas: "contatado" agora mapeia para "recebida"';
  END IF;
END $$;

-- ── 3 · o CHECK-IN do dia ───────────────────────────────────────────────────
-- ⚠️ `presente_por` com FK pra profiles (lei nº 10: coluna que aponta pra
-- pessoa sem FK é invisível pro `merge_membros` e vira ponteiro morto).
-- Espelha o `registrado_por` que a tabela já tem.
ALTER TABLE public.apresentacao_criancas
  ADD COLUMN IF NOT EXISTS presente_em  timestamptz,
  ADD COLUMN IF NOT EXISTS presente_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ⚠️ `ADD COLUMN IF NOT EXISTS ... REFERENCES` ENGOLE a FK quando a coluna já
-- existe (lição de 30/07 · `vol_profiles.membresia_id`): o comando inteiro é
-- pulado, REFERENCES incluído. Por isso a FK é conferida e criada à parte.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.apresentacao_criancas'::regclass
       AND contype = 'f'
       AND conname = 'apresentacao_criancas_presente_por_fkey'
  ) THEN
    ALTER TABLE public.apresentacao_criancas
      ADD CONSTRAINT apresentacao_criancas_presente_por_fkey
      FOREIGN KEY (presente_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK presente_por criada';
  END IF;
END $$;

COMMENT ON COLUMN public.apresentacao_criancas.presente_em IS
  'Check-in do DIA da apresentação (Kids · 15/09/2026). Quem foi marcado aqui apareceu e recebeu o kit. NÃO confundir com status=realizado, que é carimbado no lote pra turma inteira depois da cerimônia.';
COMMENT ON COLUMN public.apresentacao_criancas.presente_por IS
  'Quem marcou o check-in (profiles.id · snapshot com FK · ON DELETE SET NULL).';

-- ── Conferência (rodar DEPOIS, no SQL Editor) ───────────────────────────────
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'chk_apres_status';
-- select column_name from information_schema.columns
--   where table_name = 'apresentacao_criancas' and column_name in ('presente_em','presente_por');
-- select count(*) filter (where status_canonico = 'recebida') as recebidas
--   from public.vw_inscricoes_unificadas where porta = 'apresentacao_criancas';
