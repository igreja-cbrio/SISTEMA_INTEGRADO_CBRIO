-- ============================================================================
-- handle_new_user · o LOGIN não liga mais ninguém a cadastro nenhum
-- (decisão do Marcos · 2026-08-06)
--
-- Palavras dele: *"sobre o gatilho ligando o login, eu acho que deve ter, mas
-- ele só deve ser acionado PÓS PREENCHER TODOS OS DADOS, e todos que baixarem
-- devem ser obrigados a preencher, e somente após o preenchimento entrar no app;
-- e com os dados completos, aí sim ir para o módulo de duplicatas se houver
-- algum matcher"*.
--
-- ⚠️ O mecanismo de ligar CONTINUA existindo — ele só mudou de MOMENTO. Quem
-- liga agora é `POST /app/identidade/completar` → `acharOuCriarGuardado`
-- (matcher canônico, com CPF na mão). O gatilho passa a fazer só o que sempre
-- devia: criar a CONTA (`profiles`).
--
-- POR QUE (medido em 05/08, antes de mexer):
--   · O gatilho ligava por e-mail + NOME — sinal médio. Com login do Google só
--     existem e-mail e nome, então a pessoa caía num cadastro que outra porta
--     preencheu e ENTRAVA NO APP herdando CPF, nascimento e sexo que ela nunca
--     forneceu. Das 89 contas com cadastro vinculado, 9 passavam o gate e TODAS
--     as 9 por herança (confirmações reais pelo app: 0).
--   · Caso concreto: o Pedro Paiva logou com o Gmail pessoal e foi ligado ao
--     cadastro dele importado do Next (status visitante). Nada errado no match —
--     mas ele não tinha PROVADO nada, e o app não pode liberar por palpite.
--   · Ritmo real: ~2 logins/dia de membro (13 profiles em 7 dias). Desde o
--     conserto de 04/08 o gatilho não CRIOU nenhum cadastro (`auth_signup` = 0);
--     ele vinha LIGANDO — que é justamente o que sai agora.
--
-- O QUE MUDA, EM UMA LINHA: `profiles` nasce com `membro_id = NULL`; o portão do
-- app manda preencher; ao preencher, o matcher canônico decide com CPF; o par
-- duvidoso segue pra fila humana em /entradas.
--
-- ⚠️⚠️ CONSEQUÊNCIA CONHECIDA E ACEITA: quem loga e AINDA NÃO preencheu fica sem
-- `mem_membros`. No app isso é irrelevante (o portão bloqueia tudo até
-- preencher). Fora dele — webapp do devocional — a pessoa vê "você não é
-- membro" até completar o cadastro. É honesto: ela realmente ainda não é. A
-- versão anterior criava um cadastro-fantasma só pra aquela tela não reclamar,
-- que é o anti-padrão que esta migration remove.
--
-- ⚠️ Base: a definição de `20260804140000` (que é a viva — foi extraída de prod
-- com `pg_get_functiondef` e aplicada no mesmo dia). O único trecho alterado é o
-- ramo de MEMBRO; staff, normalização, melhoria de nome e o bloco protegido
-- ficam byte a byte. Se prod tiver divergido depois disso, comparar antes.
--
-- ⚠️ NÃO reescreve o passado: os 24 cadastros `origem='auth'` e os vínculos já
-- criados continuam onde estão (o par duplicado deles vive na fila de
-- /entradas). E `profiles.app_ficha_confirmada_em` (20260805150000) continua
-- sendo o que fecha o furo pras contas ANTIGAS, que já têm `membro_id`.
--
-- Aplicação manual: 1 colagem. Só FUNÇÃO (nenhum lock de tabela). Idempotente.
-- ============================================================================
SET lock_timeout = '10s';

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
  -- ⚠️ v_nome_meta = nome REAL do provedor (pode ser NULL) · v_nome_efetivo = o
  -- que vai na coluna NOT NULL, com o fallback histórico. Separados de propósito.
  v_nome_meta text := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'nome', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '')
  );
  v_nome_efetivo text;
BEGIN
  v_nome_efetivo := coalesce(v_nome_meta, split_part(coalesce(new.email, ''), '@', 1), 'Sem nome');

  SELECT area, cargo INTO rh_area, rh_cargo
    FROM rh_funcionarios
   WHERE email = new.email AND status = 'ativo'
   LIMIT 1;
  is_staff := found;

  IF is_staff THEN
    -- Funcionário: só profile (comportamento original, intocado).
    INSERT INTO public.profiles (id, name, email, role, area)
    VALUES (new.id, v_nome_efetivo, new.email, 'assistente', rh_area)
    ON CONFLICT (id) DO UPDATE
      SET area = coalesce(excluded.area, profiles.area),
          -- melhora o nome quando o guardado é o prefixo do e-mail
          name = CASE
            WHEN public.fn_nome_derivado_de_email(profiles.name, profiles.email)
             AND NOT public.fn_nome_derivado_de_email(excluded.name, excluded.email)
            THEN excluded.name ELSE profiles.name END;
    RETURN new;
  END IF;

  -- ── Membro ────────────────────────────────────────────────────────────────
  -- ⚠️⚠️ SÓ A CONTA. Nada de `mem_membros` aqui: nem criar (fantasma sem chave
  -- nenhuma) nem ligar (palpite por e-mail + nome). `membro_id` fica NULL de
  -- propósito — é ele que faz o portão do app mandar preencher a ficha, e é ao
  -- preencher que o matcher canônico resolve a identidade com CPF.
  -- ⚠️ `is_membro_only = true` CONTINUA obrigatório: sem isso a pessoa cai no
  --    /dashboard do ERP em vez do app.
  -- ⚠️ Os metadados (cpf, telefone, nascimento, frequenta_area) NÃO se perdem —
  --    ficam em `auth.users.raw_user_meta_data` e o backend os aplica ao
  --    completar o cadastro. Só deixam de virar cadastro sem prova.
  -- Bloco protegido: erro aqui NUNCA pode abortar o signup.
  BEGIN
    INSERT INTO public.profiles (id, name, email, role, is_membro_only)
    VALUES (new.id, v_nome_efetivo, new.email, 'assistente', true)
    ON CONFLICT (id) DO UPDATE
      SET is_membro_only = true,
          name = CASE
            WHEN public.fn_nome_derivado_de_email(profiles.name, profiles.email)
             AND NOT public.fn_nome_derivado_de_email(excluded.name, excluded.email)
            THEN excluded.name ELSE profiles.name END;

  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: criação do profile falhou (% / %) — signup preservado', SQLSTATE, SQLERRM;
  END;

  RETURN new;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Gatilho de auth.users (on_auth_user_created). Desde 2026-08-06 cria SOMENTE a conta (profiles) — não cria nem liga mem_membros. Decisão do Marcos: o vínculo é feito DEPOIS que a pessoa preenche a ficha completa (POST /app/identidade/completar → matcher canônico com CPF), e o par duvidoso vai pra fila humana em /entradas. Antes ligava por e-mail+nome, e quem caía num cadastro completo entrava no app herdando CPF/nascimento/sexo que nunca forneceu (9 de 89 contas). Staff continua só profile. NUNCA aborta o signup.';

-- Conferência (rodar no SQL Editor depois de aplicar):
--   -- 1) a função não cita mais o matcher:
--   select position('fn_link_or_create_membro' in pg_get_functiondef(p.oid)) = 0
--            as sem_matcher_no_gatilho
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'handle_new_user';
--
--   -- 2) o gatilho continua pendurado em auth.users:
--   select tgname from pg_trigger
--    where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
--   -- 3) daqui pra frente, profile novo de membro nasce sem membro_id:
--   select count(*) from public.profiles
--    where is_membro_only and membro_id is null and created_at > now() - interval '1 day';
