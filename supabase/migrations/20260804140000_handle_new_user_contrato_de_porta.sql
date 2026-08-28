-- ============================================================================
-- handle_new_user · a ÚLTIMA entrada de PESSOA entra no Contrato de porta
-- (investigação do Marcos · 2026-08-04)
--
-- ⚠️ ESTE ARQUIVO É O PRIMEIRO REGISTRO EM GIT DESTE GATILHO. Ele existia SÓ em
--    produção desde 16/06 (commit 04ce6ea2 estendeu a função em prod; a migration
--    daquele PR criou apenas a coluna `frequenta_area`). O arquivo citado no
--    CLAUDE.md, `supabase/handle_new_user_membro.sql`, nunca foi commitado —
--    `git log --all --diff-filter=A` devolve zero. É a causa-raiz de tudo: o
--    Contrato de porta foi desenhado sobre o que estava VISÍVEL no repositório,
--    então uma entrada de PII fora do git não podia ser coberta por ele.
--    A versão substituída aqui é a definição VIVA, extraída com
--    `pg_get_functiondef` em 04/08 — não uma reconstrução.
--
-- O QUE ESTAVA ERRADO (medido em prod, 04/08 · 22 cadastros `origem='auth'`):
--   · 95% sem CPF/telefone/nascimento, 100% sem sexo, 15 com o nome igual ao
--     PREFIXO DO E-MAIL (pior caso: Apple "Ocultar meu e-mail" → nome aleatório,
--     tipo "sy9p84mryx"). Ritmo ~1/dia.
--   · CPF e telefone entravam CRUS do metadata: um CPF mascarado ("123.456.789-01")
--     não casa com o índice `uniq_mem_membros_cpf_ativo` (digits-only) nem com o
--     lookup de dedup → fábrica silenciosa de duplicata.
--   · Ligava por `email = new.email` SOZINHO — a lei diz que e-mail exige NOME
--     batendo, porque a família compartilha o endereço.
--   · Telefone divergente era DESCARTADO no ramo "membro já existe" (a decisão de
--     17/07 é ACUMULAR em `mem_contatos`).
--   · Não olhava `mem_cadastros_pendentes`: em 02/08 a Maria Victória preencheu o
--     formulário público às 11:49 COM CPF, o gatilho criou um 2º cadastro dela às
--     11:57 sem chave nenhuma, e às 14:03 ela preencheu DE NOVO porque nunca foi
--     reconhecida.
--
-- ⚠️⚠️ RISCO QUE JÁ EXISTIA E ESTE ARQUIVO DESARMA: o corpo antigo não tinha
--    tratamento de exceção. Como o gatilho é AFTER INSERT em `auth.users`, QUALQUER
--    erro na escrita de `mem_membros`/`profiles` aborta o INSERT do usuário — ou
--    seja, **a pessoa não consegue criar conta**. Duas pessoas se cadastrando com
--    o mesmo CPF já bastavam (23505 no índice único). Agora a contabilidade roda
--    em bloco protegido: falha nela vira WARNING e garante o profile mínimo.
--    **Signup nunca deve falhar por causa da nossa escrituração.**
--
-- Aplicação manual: 1 colagem. Só FUNÇÕES (nenhum lock de tabela · não se aplica
-- a regra de "1 tabela por colagem"). Idempotente.
-- ============================================================================
SET lock_timeout = '10s';

-- ── Espelho SQL de `ehNomeDerivadoDeEmail` (services/membroMatch.js) ─────────
-- Detecta nome que é o PREFIXO do próprio e-mail. ⚠️ Exige o e-mail e compara
-- com ele: NÃO é heurística de "nome estranho", então não pega apelido nem nome
-- curto legítimo. Usado só pra MELHORAR nome ruim — nunca pra apagar cadastro.
-- ⚠️ Se a régua mudar no JS, muda aqui: duas réguas divergentes fariam o gatilho
-- e o aviso da equipe discordarem sobre a mesma pessoa.
CREATE OR REPLACE FUNCTION public.fn_nome_derivado_de_email(p_nome text, p_email text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_nome IS NULL OR p_email IS NULL THEN false
    WHEN trim(p_nome) = '' OR position('@' in p_email) = 0 THEN false
    ELSE lower(regexp_replace(trim(p_nome), '[\s._-]', '', 'g'))
       = lower(regexp_replace(split_part(trim(p_email), '@', 1), '[\s._-]', '', 'g'))
  END
$fn$;

COMMENT ON FUNCTION public.fn_nome_derivado_de_email(text, text) IS
  'Nome é o prefixo do próprio e-mail? Espelho SQL de ehNomeDerivadoDeEmail (membroMatch.js). Vem do fallback split_part(email) do signup quando o provedor OAuth não manda nome. Só pra MELHORAR nome ruim — nunca pra apagar.';

-- ── O gatilho ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  rh_area   text;
  rh_cargo  text;
  is_staff  boolean := false;
  v_membro_id uuid;
  v_cpf   text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), '');
  v_tel   text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'telefone', ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(new.email, ''))), '');
  v_nasc  date;
  -- v_nome_meta = nome REAL informado pelo provedor/app (pode ser NULL).
  -- v_nome_efetivo = o que vai na coluna NOT NULL, com o fallback histórico.
  -- ⚠️ Os dois são separados de propósito: é `v_nome_meta IS NULL` que diz
  --    "não sabemos o nome desta pessoa", e essa informação decide a política
  --    de match. Colapsar os dois (o que o código antigo fazia) faz o prefixo
  --    do e-mail ser tratado como se fosse um nome de verdade.
  v_nome_meta text := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'nome', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '')
  );
  v_nome_efetivo text;
  v_nome_membro  text;   -- nome JÁ gravado no membro (compara com o do pendente)
  v_freq  text := nullif(new.raw_user_meta_data->>'frequenta_area', '');
  -- origem: só o cadastro NATIVO do app manda 'app'; logins web/magic-link/admin
  -- caem em 'auth' (não inflam a métrica de cadastros pelo app).
  v_origem text := coalesce(nullif(new.raw_user_meta_data->>'origem', ''), 'auth');
BEGIN
  v_nome_efetivo := coalesce(v_nome_meta, split_part(coalesce(new.email, ''), '@', 1), 'Sem nome');

  -- CPF só vale com 11 dígitos E dígito verificador válido (a porta valida DV;
  -- aqui era campo livre do metadata). CPF inválido é DESCARTADO em vez de virar
  -- identidade errada — melhor sem CPF do que com CPF de outra pessoa.
  IF v_cpf IS NOT NULL AND (length(v_cpf) <> 11 OR NOT public.fn_cpf_dv_valido(v_cpf)) THEN
    v_cpf := NULL;
  END IF;
  IF v_tel IS NOT NULL AND length(v_tel) NOT BETWEEN 10 AND 13 THEN
    v_tel := NULL;
  END IF;
  IF v_freq IS NOT NULL AND v_freq NOT IN ('ami', 'bridge') THEN
    v_freq := NULL;
  END IF;
  BEGIN
    v_nasc := nullif(new.raw_user_meta_data->>'data_nascimento', '')::date;
  EXCEPTION WHEN others THEN
    v_nasc := NULL;   -- data podre no metadata não pode derrubar o signup
  END;

  SELECT area, cargo INTO rh_area, rh_cargo
    FROM rh_funcionarios
   WHERE email = new.email AND status = 'ativo'
   LIMIT 1;
  is_staff := found;

  IF is_staff THEN
    -- Funcionário: só profile (comportamento original preservado).
    INSERT INTO public.profiles (id, name, email, role, area)
    VALUES (new.id, v_nome_efetivo, new.email, 'assistente', rh_area)
    ON CONFLICT (id) DO UPDATE
      SET area = coalesce(excluded.area, profiles.area),
          -- melhora o nome quando o guardado é o prefixo do e-mail e o novo não é
          name = CASE
            WHEN public.fn_nome_derivado_de_email(profiles.name, profiles.email)
             AND NOT public.fn_nome_derivado_de_email(excluded.name, excluded.email)
            THEN excluded.name ELSE profiles.name END;
    RETURN new;
  END IF;

  -- ── Membro ────────────────────────────────────────────────────────────────
  -- Bloco protegido: erro aqui NÃO pode abortar o signup (ver o aviso do topo).
  BEGIN
    -- Matcher CANÔNICO (fn_link_or_create_membro · 20260721150000): normaliza,
    -- aplica CPF exato → telefone+NOME → e-mail+NOME, acumula contato divergente
    -- em mem_contatos e trata a corrida 23505.
    -- ⚠️ Passamos `v_nome_meta` (não o efetivo): sem nome real o matcher cai no
    --    ramo legado de e-mail sozinho — que aqui é seguro, porque o e-mail É o
    --    da conta que acabou de autenticar — e então RECUSA criar. Passar o
    --    prefixo do e-mail como se fosse nome faria o ramo "e-mail + nome
    --    compatível" falhar contra o nome real já cadastrado e criar DUPLICATA.
    v_membro_id := public.fn_link_or_create_membro(
      v_cpf, v_tel, v_email, v_nome_meta, 'visitante', 'auth_signup'
    );

    IF v_membro_id IS NULL THEN
      -- Não achou e não havia nome pra criar. O membro precisa existir mesmo
      -- assim: o devocional resolve a pessoa por `profiles.membro_id` (ou e-mail
      -- em mem_membros) e, sem ele, diz "você não é membro" pra quem entra pela
      -- primeira vez. Então cria o stub com o prefixo — e o aviso diário
      -- `cadastro_sem_nome_real` (notificacaoGenerator) põe a equipe atrás do
      -- nome de verdade.
      -- ⚠️ Consertar isto DE VERDADE é o app pedir o nome na primeira tela; o
      --    banco não tem como inventar nome de pessoa.
      INSERT INTO public.mem_membros
        (id, nome, cpf, email, telefone, data_nascimento, frequenta_area,
         status, active, quer_servir, origem_cadastro, created_at, updated_at)
      VALUES (gen_random_uuid(), v_nome_efetivo, v_cpf, v_email, v_tel, v_nasc,
              v_freq, 'visitante', true, false, v_origem, now(), now())
      RETURNING id INTO v_membro_id;
    ELSE
      -- Membro existente (ou recém-criado pelo matcher): completa SÓ o que está
      -- vazio. Mesma política do censo e do CPF tardio — preencher lacuna é
      -- enriquecer; sobrescrever é decisão humana.
      UPDATE public.mem_membros
         SET data_nascimento = coalesce(data_nascimento, v_nasc),
             frequenta_area  = coalesce(frequenta_area, v_freq),
             origem_cadastro = coalesce(origem_cadastro, v_origem),
             -- e melhora o nome quando o guardado é o prefixo do e-mail
             nome = CASE
               WHEN v_nome_meta IS NOT NULL
                AND public.fn_nome_derivado_de_email(nome, coalesce(email, v_email))
               THEN v_nome_meta ELSE nome END,
             updated_at = now()
       WHERE id = v_membro_id;
    END IF;

    SELECT m.nome INTO v_nome_membro FROM public.mem_membros m WHERE m.id = v_membro_id;

    -- Cadastro do formulário público que ficou órfão: a pessoa preencheu (e está
    -- na fila de aprovação) e depois entrou com login. Aponta o pendente pro
    -- membro pra a fila mostrar "atualização cadastral" em vez de criar uma
    -- SEGUNDA pessoa — o caso da Maria Victória (02/08).
    -- ⚠️ CPF é chave forte e liga sozinho; por e-mail exige NOME compatível e
    --    respeita `nao_vincular_fraco` (a pessoa disse "não sou eu" no dedup).
    UPDATE public.mem_cadastros_pendentes p
       SET duplicado_de_id = v_membro_id,
           status = 'duplicado'
     WHERE p.status = 'pendente'
       AND p.duplicado_de_id IS NULL
       AND (
         (v_cpf IS NOT NULL AND p.cpf IS NOT NULL
            AND regexp_replace(p.cpf, '\D', '', 'g') = v_cpf)
         OR (v_email IS NOT NULL AND p.email IS NOT NULL
            AND lower(trim(p.email)) = v_email
            AND coalesce(p.nao_vincular_fraco, false) = false
            AND public.fn_identidade_nomes_compativeis(p.nome, v_nome_membro)
         )
       );

    INSERT INTO public.profiles (id, name, email, role, is_membro_only, membro_id)
    VALUES (new.id, v_nome_efetivo, new.email, 'assistente', true, v_membro_id)
    ON CONFLICT (id) DO UPDATE
      SET is_membro_only = true,
          membro_id = coalesce(profiles.membro_id, excluded.membro_id),
          name = CASE
            WHEN public.fn_nome_derivado_de_email(profiles.name, profiles.email)
             AND NOT public.fn_nome_derivado_de_email(excluded.name, excluded.email)
            THEN excluded.name ELSE profiles.name END;

  EXCEPTION WHEN others THEN
    -- ⚠️ NUNCA deixar o signup falhar por causa da escrituração de membro.
    -- Antes desta versão, um 23505 no CPF impedia a pessoa de criar conta.
    RAISE WARNING 'handle_new_user: escrituração de membro falhou (% / %) — signup preservado', SQLSTATE, SQLERRM;
    INSERT INTO public.profiles (id, name, email, role, is_membro_only)
    VALUES (new.id, v_nome_efetivo, new.email, 'assistente', true)
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN new;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Gatilho de auth.users (on_auth_user_created). Entrada de PESSOA pelo LOGIN — segue o Contrato de porta desde 2026-08-04: normaliza cpf/telefone, valida DV, delega o match a fn_link_or_create_membro (dedup + mem_contatos), completa só campo vazio, liga cadastro pendente órfão e NUNCA aborta o signup. Sem nome do provedor, o nome fica sendo o prefixo do e-mail: conserto real é o app pedir o nome (aviso cadastro_sem_nome_real cobre até lá).';

-- Trigger: já existe em prod desde 16/06. Recriado só se faltar (ambiente novo),
-- em bloco próprio — falta de privilégio em auth.users não pode derrubar a
-- migration inteira, já que em prod ele está lá.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname = 'on_auth_user_created'
       AND tgrelid = 'auth.users'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
             FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
  END IF;
EXCEPTION WHEN others THEN
  RAISE WARNING 'on_auth_user_created não recriado (%): confira manualmente', SQLERRM;
END $$;

-- ⚠️ CONFERIR NO CATÁLOGO (o SQL Editor não mostra RAISE NOTICE):
--
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_new_user';
--   SELECT tgname FROM pg_trigger
--    WHERE NOT tgisinternal AND tgrelid = 'auth.users'::regclass;
--   SELECT public.fn_nome_derivado_de_email('juloora','juloora@hotmail.com') AS deve_ser_true,
--          public.fn_nome_derivado_de_email('Amanda Dady','amanda.dady05@gmail.com') AS deve_ser_false;
--
-- ⚠️ TESTE FUNCIONAL obrigatório depois de aplicar: criar UMA conta de teste
--    (login novo) e conferir que (a) a conta é criada, (b) nasce 1 membro só,
--    (c) o profile tem membro_id. Se o signup falhar, REVERTER colando a
--    definição antiga (está no corpo do PR #2262).
