-- Fusão de cadastros · o mantido passa a herdar TODO campo que estiver vazio
-- (pedido do Marcos · 18/08/2026)
--
-- ⚠️ O PROBLEMA: `merge_membros` reaponta todos os vínculos (26 tabelas com FK
-- — grupos, Next, batismo, Kids, contribuições, login), mas ENRIQUECE apenas 5
-- campos: cpf, telefone, email, data_nascimento, foto_url. Todo o resto que só
-- existia no cadastro excluído morre com ele.
--
-- Medido em 18/08 nos 41 pares candidatos vivos (mesmo e-mail + mesmo primeiro
-- nome): **38 têm campo que um lado tem e o outro não — 111 campos em risco**.
-- O mais perdido é `genero` (22 pares) — justamente o que decide se a pessoa
-- pode entrar em grupo de Homens ou de Mulheres.
--
-- ⚠️⚠️ POR QUE UM TRIGGER NO LOG, E NÃO UM PATCH NA FUNÇÃO:
-- `merge_membros` tem ~200 linhas, foi reescrita 4× e a definição VIVA pode não
-- ser a do repositório (drift já aconteceu com handle_new_user e com o fanout).
-- Patch textual sobre ela exigiria acertar uma âncora que eu não consigo ler
-- daqui — e errar significa ou abortar a migration ou, pior, recolar uma versão
-- antiga por cima de algo que só existe em produção.
--
-- `mem_merge_log.snapshot` já guarda `to_jsonb(m.*)` de cada cadastro apagado —
-- as 53 colunas, conferidas em 18/08. Então dá para enriquecer DEPOIS, a partir
-- do log, sem tocar numa linha da função. Vale para qualquer chamador.

CREATE OR REPLACE FUNCTION public.fn_merge_membros_enriquecer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_elem   jsonb;
  v_col    text;
  v_udt    text;
  v_sets   text[];
  v_sql    text;
BEGIN
  IF NEW.snapshot IS NULL OR jsonb_typeof(NEW.snapshot) <> 'array' THEN
    RETURN NULL;
  END IF;

  -- ⚠️ Monta a lista de colunas UMA vez, do catálogo — assim coluna nova nasce
  -- sendo herdada, sem ninguém precisar lembrar de vir aqui. Colunas GERADAS e
  -- de identidade ficam fora (UPDATE nelas é erro).
  v_sets := ARRAY[]::text[];
  FOR v_col, v_udt IN
    SELECT c.column_name, c.udt_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = 'mem_membros'
       AND c.is_generated = 'NEVER'
       AND c.identity_generation IS NULL
       AND c.column_name NOT IN (
         -- identidade e ciclo de vida da LINHA mantida
         'id', 'created_at', 'updated_at', 'deleted_at',
         -- ⚠️ DECISÃO DA IGREJA, não efeito colateral de fusão: promover
         -- alguém de `visitante` a `membro_ativo` porque o duplicado era
         -- membro seria o sistema decidindo membresia.
         'status', 'active',
         -- ⚠️ CONSENTIMENTO: tratado logo abaixo, com a régua "só liga, nunca
         -- desliga" e trazendo a DATA DA PROVA junto.
         'whatsapp_optin', 'whatsapp_optin_em',
         -- ⚠️ BIOMETRIA + o consentimento dela. Copiar o descritor facial de
         -- um cadastro para outro é decisão humana, e copiá-lo SEM a prova de
         -- consentimento junto seria pior que perdê-lo.
         'face_descriptor', 'face_consentimento', 'face_consentimento_em',
         'face_cadastrado_em'
       )
     ORDER BY c.ordinal_position
  LOOP
    -- ⚠️ Em coluna de texto, string VAZIA é tão ausente quanto NULL — e a base
    -- tem as duas formas (a lição do `genero = ''` da migration 20260814160000).
    IF v_udt IN ('text', 'varchar', 'bpchar') THEN
      v_sets := v_sets || format('%1$I = COALESCE(NULLIF(k.%1$I, %2$L), s.%1$I)', v_col, '');
    ELSE
      v_sets := v_sets || format('%1$I = COALESCE(k.%1$I, s.%1$I)', v_col);
    END IF;
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- ⚠️ `jsonb_populate_record` devolve um registro TIPADO de mem_membros a
  -- partir do snapshot: resolve o cast de cada coluna sem eu precisar saber o
  -- tipo, e ignora chave que não existe mais na tabela.
  v_sql := format(
    'UPDATE public.mem_membros k SET %s
       FROM jsonb_populate_record(NULL::public.mem_membros, $1) s
      WHERE k.id = $2',
    array_to_string(v_sets, ', ')
  );

  BEGIN
    -- Vários apagados: o PRIMEIRO valor não-vazio vence, porque depois do 1º
    -- passe o campo deixa de estar vazio.
    FOR v_elem IN SELECT value FROM jsonb_array_elements(NEW.snapshot) LOOP
      EXECUTE v_sql USING v_elem, NEW.keep_id;

      -- ⚠️ CONSENTIMENTO DE WHATSAPP · SÓ LIGA, NUNCA DESLIGA (régua de 05/08).
      -- É a mesma pessoa, então o aceite dela numa porta vale; mas a DATA é a
      -- prova, e por isso vem junto — carimbar "agora" apagaria desde quando o
      -- consentimento vale.
      UPDATE public.mem_membros k
         SET whatsapp_optin    = true,
             whatsapp_optin_em = COALESCE(k.whatsapp_optin_em, s.whatsapp_optin_em)
        FROM jsonb_populate_record(NULL::public.mem_membros, v_elem) s
       WHERE k.id = NEW.keep_id
         AND COALESCE(k.whatsapp_optin, false) = false
         AND s.whatsapp_optin IS TRUE;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- ⚠️⚠️ OBRIGATÓRIO: exceção em trigger AFTER aborta o statement inteiro —
    -- ou seja, uma falha AQUI desfaria a fusão que já deu certo. Enriquecer é
    -- ganho; perdê-lo não pode custar o merge. (Mesma lei do espelho de
    -- incidentes e do gatilho de auth.)
    RAISE WARNING 'fn_merge_membros_enriquecer falhou para keep % : %', NEW.keep_id, SQLERRM;
  END;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_merge_membros_enriquecer() IS
  'Fusão de cadastros: preenche no mantido TODO campo vazio a partir do '
  'snapshot do excluído (mem_merge_log.snapshot). Existe como trigger no LOG, '
  'e não dentro de merge_membros, para não depender da definição viva daquela '
  'função. FORA da herança, de propósito: status/active (decisão da igreja), '
  'whatsapp_optin (consentimento, tratado com "só liga, nunca desliga" + data '
  'da prova) e os campos de face (biometria + consentimento).';

DROP TRIGGER IF EXISTS trg_merge_membros_enriquecer ON public.mem_merge_log;
CREATE TRIGGER trg_merge_membros_enriquecer
AFTER INSERT ON public.mem_merge_log
FOR EACH ROW EXECUTE FUNCTION public.fn_merge_membros_enriquecer();

-- Conferência (o SQL Editor não mostra RAISE NOTICE):
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.mem_merge_log'::regclass and not tgisinternal;
--   select obj_description('public.fn_merge_membros_enriquecer()'::regprocedure);
