-- ============================================================================
-- merge_membros · a fusão RESOLVE a pendência de identidade que ela mesma
-- repontou, em vez de deixá-la apontando pra si mesma (2026-08-14).
--
-- O QUE ACONTECIA
-- `identidade_pendencias` tem DUAS colunas com FK pra mem_membros (`membro_id`
-- e `membro_conflito_id`). O laço de repoint do `merge_membros` descobre os
-- filhos pelo CATÁLOGO (`pg_constraint`), então ele aponta as DUAS colunas pro
-- cadastro mantido — e a pendência passa a dizer "o CPF deste cadastro conflita
-- com ele mesmo". Impossível de resolver, e VISÍVEL na aba Conflitos de CPF das
-- Entradas.
--
-- Medido antes de escrever: 39 pendências com `membro_id = membro_conflito_id`
-- (37 já resolvidas na mesma ação humana que fundiu · 1 descartada · 1 AINDA
-- PENDENTE: "Fernanda Figueredo Sarruf Sudré", criada 13/08 e repontada pela
-- fusão de hoje). As outras duas tabelas de PAR já estão protegidas — o
-- `merge_membros` APAGA `mem_duplicados_ignorados` e `mem_identidade_pares`
-- antes do repoint, e as duas têm 0 self-pair. `identidade_pendencias` ficou
-- fora.
--
-- ⚠️ RESOLVE, não APAGA. A linha é trilha de trabalho humano (`resolvida_por`,
-- `resolvida_em`) e `entradas_resolucoes` a referencia por `origem_id` —
-- apagá-la sumiria com a prova de que o conflito existiu e foi tratado.
--
-- ⚠️ Conferido no catálogo ANTES de escrever, porque exceção aqui abortaria a
-- FUSÃO INTEIRA (escrituração não pode derrubar o ato principal):
-- `identidade_pendencias.resolvida_por` **não tem FK**, e `p_feito_por` já é
-- obrigatoriamente um `profiles.id` válido — `mem_merge_log.feito_por` tem FK
-- pra profiles e é gravado no fim desta mesma função. Logo o valor é seguro.
--
-- ⚠️ PATCH DINÂMICO (`pg_get_functiondef` + `replace`), NUNCA `CREATE OR REPLACE`
-- a partir do arquivo do repo: a definição VIVA de `merge_membros` pode ter
-- ajuste feito direto em produção, e colar o corpo do arquivo reverteria aquilo
-- em silêncio. Mesma técnica da 20260729060000 / 20260813120000.
--
-- Idempotente. ABORTA se a forma viva divergir do esperado.
-- ============================================================================

DO $$
DECLARE
  v_def          text;
  v_sem_coment   text;
  v_novo         text;
  v_ocorrencias  int;
  v_assinaturas  int;
  v_anchor constant text := 'DELETE FROM public.mem_membros WHERE id = ANY(p_merge_ids);';
  v_bloco  constant text :=
    E'-- A fusão resolve o conflito de identidade que ela mesma acabou de repontar:\n'
    '  -- as duas colunas de membro desta tabela têm FK, então o laço acima apontou\n'
    '  -- ambas pro mantido e a linha viraria "conflito consigo mesmo" (indecidível\n'
    '  -- e visível na aba Conflitos de CPF). Resolve em vez de apagar: a linha é\n'
    '  -- trilha de decisão humana e entradas_resolucoes a referencia.\n'
    '  UPDATE public.identidade_pendencias\n'
    '     SET status = ''resolvida'',\n'
    '         resolvida_em = now(),\n'
    '         resolvida_por = coalesce(resolvida_por, p_feito_por),\n'
    '         detalhe = coalesce(nullif(detalhe, ''''), ''Conflito de identidade'')\n'
    '                   || '' [resolvido pela fusão dos dois cadastros]''\n'
    '   WHERE membro_id = p_keep_id\n'
    '     AND membro_conflito_id = p_keep_id\n'
    '     AND status NOT IN (''resolvida'', ''descartada'');\n';
BEGIN
  -- 0. Existe EXATAMENTE uma assinatura? Overload deixaria a versão antiga
  --    alcançável e o patch pareceria aplicado.
  SELECT count(*) INTO v_assinaturas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'merge_membros';
  IF v_assinaturas <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: merge_membros tem % assinatura(s) em public — conferir antes de patchar', v_assinaturas;
  END IF;

  SELECT pg_get_functiondef('public.merge_membros(uuid,uuid[],uuid,text)'::regprocedure) INTO v_def;

  -- 1. Idempotência: procura o COMANDO, sobre a definição SEM COMENTÁRIO.
  --    (o comentário do bloco novo menciona as colunas em prosa, e casar
  --    identificador solto daria falso positivo — lição de 2026-08-06)
  v_sem_coment := regexp_replace(v_def, '--[^\n]*', '', 'g');
  IF position('membro_conflito_id = p_keep_id' in v_sem_coment) > 0 THEN
    RAISE NOTICE 'merge_membros JÁ resolve pendência contra si mesma — nada a fazer.';
    RETURN;
  END IF;

  -- 2. Guarda de drift: a âncora tem que aparecer exatamente 1× na definição
  --    REAL (contar no texto cru, não no sem-comentário: se ela aparecesse
  --    também num comentário, o replace acertaria o lugar errado e a contagem
  --    de 2 nos aborta).
  v_ocorrencias := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_ocorrencias <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: a âncora aparece % vez(es) na definição viva de merge_membros (esperado 1)', v_ocorrencias;
  END IF;

  v_novo := replace(v_def, v_anchor, v_bloco || '  ' || v_anchor);
  EXECUTE v_novo;

  -- 3. Confere no CATÁLOGO que o patch entrou (nunca confiar no "sem erro").
  SELECT pg_get_functiondef('public.merge_membros(uuid,uuid[],uuid,text)'::regprocedure) INTO v_def;
  IF position('membro_conflito_id = p_keep_id' in regexp_replace(v_def, '--[^\n]*', '', 'g')) = 0 THEN
    RAISE EXCEPTION 'ABORTADO: o patch não está presente na definição depois do EXECUTE';
  END IF;
  RAISE NOTICE 'merge_membros patchado: fusão passa a resolver pendência contra si mesma.';
END $$;

-- ============================================================================
-- PARTE 2 · o passado. Só as que ficaram ABERTAS apontando pra si mesmas —
-- as 37 já resolvidas ficam intactas (reescrever histórico resolvido não
-- acrescenta nada e apagaria a data real da decisão).
-- ============================================================================
UPDATE public.identidade_pendencias
   SET status = 'resolvida',
       resolvida_em = now(),
       detalhe = coalesce(nullif(detalhe, ''), 'Conflito de identidade')
                 || ' [resolvido pela fusão dos dois cadastros · saneamento 2026-08-14]'
 WHERE membro_id IS NOT NULL
   AND membro_id = membro_conflito_id
   AND status NOT IN ('resolvida', 'descartada');

COMMENT ON TABLE public.identidade_pendencias IS
  'Fila humana de conflitos de identidade (Entradas > Conflitos de CPF). ⚠️ As DUAS colunas de membro têm FK pra mem_membros, então merge_membros as reponta e a linha pode virar "conflito consigo mesmo" — o próprio merge_membros resolve esse caso desde 2026-08-14. NÃO remover aquele UPDATE do corpo da função.';
