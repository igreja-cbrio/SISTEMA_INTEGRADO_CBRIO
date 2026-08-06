-- ============================================================================
-- 2026-08-06 · A TELA DE PERFIL DO APP PARA DE VINCULAR PESSOA
-- Auditoria de 06/08/2026 · achado CRÍTICO nº 1
-- ============================================================================
--
-- O QUE ESTAVA ABERTO
-- -------------------
-- `app_salvar_membro` é SECURITY DEFINER com EXECUTE pra `authenticated`, e é
-- chamada por `app/(app)/perfil.tsx` a cada "Salvar". Quando o profile ainda
-- NÃO tinha `membro_id`, ela procurava um `mem_membros` por:
--
--     (a) CPF                                    -- chave forte
--     (b) últimos 11 dígitos do TELEFONE         -- família compartilha
--     (c) `lower(btrim(nome))` EXATO              -- homônimo é comum
--
-- ...e vinculava a conta ao PRIMEIRO que achasse, **sem nenhuma prova de
-- posse**. Efeito: qualquer conta logada digitava o nome de um homônimo (ou o
-- telefone da casa) e passava a ver o grupo, o comprovante de contribuições e
-- os FILHOS NO KIDS daquela pessoa — porque `profiles.membro_id` é o que
-- `current_user_membro_id()` usa nas policies de Kids e de contribuições.
--
-- É o MESMO furo que a `20260806120000` fechou na porta da frente ("o login não
-- liga ninguém") e que a LEI de 04/08 já tinha escrito: **CPF IDENTIFICA, NÃO
-- AUTENTICA.** A porta da frente foi fechada; esta lateral ficou aberta.
--
-- Agravantes medidos na mesma auditoria:
--   · `cpf = coalesce(v_cpf, cpf)` gravava CPF **sem validar o dígito
--     verificador** — e CPF torto em `mem_membros` envenena o matcher de TODAS
--     as portas do sistema;
--   · `set is_membro_only = true` rodava pra QUALQUER chamador, inclusive
--     STAFF: um funcionário salvando o perfil pelo app era marcado como
--     app-only. Esta migration para de tocar `profiles` — não é papel de uma
--     tela de perfil decidir o tipo da conta.
--
-- O QUE ESTA MIGRATION FAZ
-- ------------------------
-- **Estreita, não dropa.** A função continua existindo, com a MESMA assinatura,
-- e continua salvando a ficha de quem já está vinculado — só perde os ramos de
-- BUSCA e de CRIAÇÃO de pessoa. Motivo de não dropar agora: `perfil.tsx` ainda
-- a chama, e revogar/dropar antes do app ser republicado deixaria a tela de
-- perfil sem salvar (a correção do app é a onda seguinte, e vai por OTA).
-- Quando o app estiver chamando `PUT /app/membro/perfil`, o drop é 1 linha.
--
-- Quem resolve IDENTIDADE passa a ser só `POST /app/identidade/*`
-- (`services/appIdentidade.js`): CPF acha o cadastro → o código vai pro contato
-- QUE JÁ ESTÁ NO CADASTRO → quem prova posse é vinculado, e o par duvidoso vai
-- pra fila humana em /entradas. Esse caminho já existe, já está no ar e é
-- obrigatório pra entrar no app desde 05/08.
--
-- IMPACTO ESPERADO NO USO REAL: ~nenhum. O portão da ficha (05/08) exige
-- cadastro completo E confirmado por ESTA conta pra usar o app, então quem
-- chega na tela de perfil já tem `membro_id`. Conta sem vínculo que chamar a
-- função recebe `null` (o app trata: `if (vId) setMembroId(...)`) e os campos
-- de `profiles` continuam salvando normalmente, porque isso é feito pelo
-- próprio cliente antes da RPC.
--
-- ⚠️ IDEMPOTENTE e sem DDL de tabela — pode rodar mais de uma vez.
-- ============================================================================

-- ── Guarda de assinatura: NUNCA criar overload ──────────────────────────────
-- `CREATE OR REPLACE FUNCTION` com assinatura diferente NÃO substitui: cria uma
-- SEGUNDA função com o mesmo nome (lição registrada em
-- `feedback_pg_function_overload_default`). Se o banco vivo tiver uma
-- assinatura diferente da que esta migration escreve, é sinal de drift — e aí a
-- migration ABORTA em vez de deixar duas funções, com a antiga (perigosa) ainda
-- alcançável pelo app.
do $$
declare
  v_assinaturas text;
  v_qtd int;
begin
  select count(*), coalesce(string_agg(pg_get_function_identity_arguments(p.oid), ' | '), '(nenhuma)')
    into v_qtd, v_assinaturas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_salvar_membro';

  if v_qtd = 0 then
    raise notice 'app_salvar_membro não existe neste banco — a migration vai criá-la já estreitada.';
  elsif v_qtd > 1 then
    raise exception 'DRIFT: há % versões de app_salvar_membro (%). Resolver o overload à mão antes de aplicar.', v_qtd, v_assinaturas;
  elsif v_assinaturas is distinct from 'p_cpf text, p_nome text, p_telefone text, p_email text, p_nascimento date' then
    raise exception 'DRIFT: assinatura viva é (%), diferente da esperada. Conferir pg_get_functiondef antes de aplicar.', v_assinaturas;
  end if;
end $$;

create or replace function public.app_salvar_membro(
  p_cpf text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_nascimento date
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;

  -- Só o cadastro JÁ vinculado a esta conta. Sem busca, sem criação.
  select membro_id into v_id from public.profiles where id = v_uid;

  -- ⚠️⚠️ NÃO REINTRODUZIR RAMO DE BUSCA AQUI (nem por CPF).
  -- Vincular conta a cadastro é ato de IDENTIDADE e exige prova de posse:
  -- `POST /app/identidade/por-cpf` → código pro contato do CADASTRO →
  -- `/confirmar`. CPF está em nota fiscal e cadastro de loja; digitar um CPF
  -- não prova ser dono dele. Ver a LEI de 04/08 no CLAUDE.md.
  if v_id is null then
    return null;
  end if;

  update public.mem_membros set
    -- ⚠️ `nullif(btrim(...), '')`: string vazia do formulário é "não informado",
    -- nunca "apagar o que está lá".
    telefone        = coalesce(nullif(btrim(p_telefone), ''), telefone),
    nome            = coalesce(nullif(btrim(p_nome), ''), nome),
    data_nascimento = coalesce(p_nascimento, data_nascimento),
    -- ⚠️ CPF só PREENCHE campo vazio, e só com DV válido — mesma política do
    -- gatilho de auth (`20260804140000`) e do censo. Sobrescrever CPF existente
    -- é decisão humana (fila de identidade), e CPF sem DV é lixo que quebra o
    -- matcher de todas as portas.
    cpf = case
            when coalesce(btrim(cpf), '') <> '' then cpf
            when v_cpf is not null and public.fn_cpf_dv_valido(v_cpf) then v_cpf
            else cpf
          end,
    updated_at = now()
  where id = v_id
    and deleted_at is null;  -- cadastro apagado não volta a ser escrito

  -- ⚠️ NÃO toca em `profiles`: a versão antiga fazia
  -- `set membro_id = v_id, is_membro_only = true` — o `membro_id` aqui VEIO de
  -- profiles (seria no-op) e o `is_membro_only = true` marcava como app-only
  -- QUALQUER pessoa que salvasse o perfil, inclusive STAFF.

  return v_id;
end;
$function$;

comment on function public.app_salvar_membro(text, text, text, text, date) is
  'Salva a ficha do membro JÁ vinculado à conta que chama (app · tela de perfil). '
  'NÃO vincula, NÃO cria pessoa e NÃO sobrescreve CPF existente — identidade é '
  'resolvida só por /app/identidade/* com prova de posse (auditoria 06/08/2026). '
  'Estreitada em vez de dropada porque perfil.tsx ainda a chama; dropar quando o '
  'app estiver usando PUT /app/membro/perfil.';

-- O GRANT segue como estava (a função continua sendo chamada pelo app logado).
grant execute on function public.app_salvar_membro(text, text, text, text, date) to authenticated;

-- ── Conferência (rodar DEPOIS · o SQL Editor não mostra RAISE NOTICE) ────────
-- 1) uma única função, com a assinatura esperada:
--    select p.proname, pg_get_function_identity_arguments(p.oid) as args
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'app_salvar_membro';
--
-- 2) o corpo perdeu busca/criação/escrita em profiles (os 4 devem dar 0):
--
-- ⚠️⚠️ TIRAR OS COMENTÁRIOS ANTES DE CASAR TEXTO. `pg_get_functiondef` devolve o
-- corpo **com os comentários**, e este arquivo EXPLICA nos comentários o que a
-- versão antiga fazia (`set is_membro_only = true`). A 1ª versão desta
-- conferência não tirava comentário e devolveu `mexe_no_profile = 1` numa função
-- que **não toca em profiles** (o único `update` do corpo é em `mem_membros`) —
-- falso positivo, e o Marcos aplicou a migration e veio perguntar por que a
-- conferência acusava falha (06/08/2026). Era a conferência, não a migration.
-- Régua: checagem por TEXTO em corpo de função (ou em arquivo) IGNORA comentário,
-- e procura o COMANDO (`update public.profiles`), não o identificador solto.
--
--    with def as (
--      select pg_get_functiondef('public.app_salvar_membro(text,text,text,text,date)'::regprocedure) as d
--    ), codigo as (
--      select regexp_replace(d, '--[^\n]*', '', 'g') as d from def
--    )
--    select
--      (d ilike '%lower(btrim(nome))%')::int             as busca_por_nome,
--      (d ilike '%insert into public.mem_membros%')::int as cria_pessoa,
--      (d ilike '%update public.profiles%')::int         as escreve_em_profiles,
--      (d ilike '%is_membro_only%')::int                 as is_membro_only_no_codigo
--    from codigo;
