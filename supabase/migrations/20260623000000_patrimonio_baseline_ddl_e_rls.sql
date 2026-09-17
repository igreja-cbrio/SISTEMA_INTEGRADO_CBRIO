-- ============================================================================
-- RHP-05 · Patrimônio · baseline das 6 tabelas que nunca entraram no git
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ
--   Traz para o repositório o `CREATE TABLE` de `pat_categorias`,
--   `pat_localizacoes`, `pat_bens`, `pat_movimentacoes`, `pat_inventarios` e
--   `pat_inventario_itens`, que existem em produção mas não em nenhuma das
--   928 migrations.
--
-- O QUE MUDA EM PRODUÇÃO — leia com atenção, é uma coisa só e não é zero
--   O PASSO 2 executa `revoke all ... from public, anon, authenticated` e
--   `grant all ... to service_role` nas seis. Ele roda SEMPRE, inclusive em
--   produção.
--
--   O que foi medido em 09/09/2026 é que as seis devolvem `403 · 42501` a uma
--   conta comum. Isso prova ausência de GRANT **de SELECT**, e só isso. Não
--   prova nada sobre INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ou TRIGGER
--   — que é o que o `revoke all` também tira. Se algum desses estiver
--   concedido hoje a `anon` ou `authenticated`, este arquivo o remove.
--   A consulta 0.f abaixo mostra exatamente o que existe, antes de aplicar.
--
--   Os PASSOS 1 e 3 (criar tabela, ligar RLS, criar policy) são no-op em
--   produção, e isso é garantido por trava, não por promessa — ver adiante.
--
-- ⚠️ O QUE ESTE ARQUIVO NÃO FAZ
--   Ele NÃO escreve a RLS das `pat_*` em produção. Essa é a próxima tarefa, e
--   ela depende da saída do PASSO 0.a: sem saber que policies vivem lá hoje,
--   nada aqui tem o direito de sobrescrevê-las.
--
-- COMO RODAR
--   1. PASSO 0 — seis consultas, **uma de cada vez**, salvando cada saída.
--      O SQL Editor mostra só o resultado do último comando da colagem.
--   2. PASSOS 1 a 4 — TUDO NUMA COLAGEM SÓ. O passo 1 deixa a foto que o
--      passo 3 lê; colado em separado, o passo 3 para com um `PARE` explícito.
--   3. Depois de aplicar, registre a migration à mão (ver PASSO 5), senão um
--      `supabase db push` futuro tenta rodá-la de novo.
--   ⚠️ Não use `begin;`/`commit;` — o SQL Editor já abre a transação.
--
-- ⚠️ O CARIMBO DE DATA É 20260623000000 DE PROPÓSITO
--   O baseline precisa rodar antes de `20260624240000_kids_estoque.sql`, que
--   já cria FK para `pat_bens` e faz INSERT em `pat_categorias`. Ao copiar
--   para `supabase/migrations/`, mantenha este nome.
--
-- ============================================================================
-- O PROBLEMA
-- ============================================================================
-- As seis tabelas foram criadas à mão em produção. (Só as três `pat_revisao_*`
-- estão no git.) Mas DEZESSEIS migrations posteriores citam essas seis, e
-- TREZE delas escrevem nelas — ALTER, INSERT ou chave estrangeira. Critério:
-- `grep -lE 'pat_(bens|categorias|localizacoes|movimentacoes|inventarios|inventario_itens)\b'`
-- sobre os 928 arquivos de `supabase/migrations/`, contado em 09/09/2026.
-- Ou seja: o repositório escreve sobre um alicerce que ele mesmo não tem.
--
-- Consequência: o controle de acesso de R$ 13.431.325,66 em ativo imobilizado
-- (4.271 bens, medidos em 09/09/2026) não passa por code review, e um replay
-- do zero morre na primeira migration que toca as tabelas.
--
-- ⚠️ ESTE ARQUIVO NÃO FAZ UM AMBIENTE NOVO SUBIR ATÉ O FIM. Ele destrava o
-- replay até 10/08/2026. Em `20260818160000_patrimonio_fusao_locais_...` a
-- cadeia ainda morre, por motivo alheio a este arquivo: ela insere 13 linhas
-- em `plan_locais` com UUIDs de `pat_localizacoes` chumbados de produção, que
-- não existem num banco novo (violação de FK, verificada em 09/09/2026 num
-- PostgreSQL descartável). Trocar esses UUIDs por busca pelo nome é o próximo
-- tampão, e é item separado.
--
-- ============================================================================
-- POR QUE O NO-OP DOS PASSOS 1 E 3 É GARANTIDO
-- ============================================================================
-- A primeira versão deste arquivo afirmava ser no-op em produção sem ter
-- medido. A afirmação era falsa: ela supunha a RLS já ligada, e os `42501`
-- medidos não provam isso — `42501` é falta de GRANT, verificada ANTES da RLS.
-- Com a RLS desligada em alguma das seis, aquela versão a ligaria,
-- `pg_policies` voltaria zero, e ela criaria cinco policies por tabela.
--
-- Aqui o no-op é uma trava:
--   · o PASSO 1 tira uma FOTO de quais das seis já existem, antes de criar;
--   · o PASSO 3 só age nas que ESTE ARQUIVO criou agora.
-- Em produção as seis já existem, o passo 3 não toca em nada, e o NOTICE final
-- diz `PRODUÇÃO CONFIRMADA`. Verificado em 09/09/2026 num PostgreSQL 18.3
-- descartável, nos dois cenários (banco com as seis já existentes e RLS
-- desligada; banco vazio) e num cenário misto, com duas rodadas cada.
--
-- ============================================================================
-- O QUE O BASELINE TEM E O QUE NÃO TEM
-- ============================================================================
-- TEM: só as colunas ORIGINAIS. As quinze que migrations posteriores
-- acrescentam ficaram DE FORA de propósito. Essas migrations usam
-- `ADD COLUMN IF NOT EXISTS`: se o baseline declarasse a coluna pelada, o
-- ALTER viraria no-op e a CHAVE ESTRANGEIRA nunca seria criada. Seriam três
-- FKs perdidas em silêncio (`pat_bens.responsavel_id`,
-- `pat_bens.alerta_divergencia_item_id`, `pat_movimentacoes.revisao_item_id`),
-- e o PostgREST resolve embed por FK — `responsavel:profiles!responsavel_id`
-- viraria PGRST200 e a lista de bens, o detalhe, o POST e o PUT dariam 500.
-- Com as colunas de fora, os ALTERs rodam de verdade e trazem as FKs com o
-- `ON DELETE` correto (verificado em `pg_constraint` no cluster descartável).
--
-- NÃO TEM: CHECK, UNIQUE, índice e trigger. O DDL foi reconstruído do schema
-- que o PostgREST publica, que não conta isso. O baseline fica incompleto até
-- a saída do PASSO 0 ser incorporada. Três ausências que importam:
--   · sem UNIQUE em `pat_bens.codigo_barras`, a `pat_proximo_codigo_barras`
--     (que faz max+1) permitiria código duplicado num ambiente novo;
--   · `updated_at` tem default `now()` e não existe trigger de `pat_*` em
--     nenhuma das 928 migrations — hoje ela nasce e nunca mais muda sozinha;
--   · a ORDEM ordinal das colunas difere de produção (`localizacao_pendente`
--     é a 28ª lá e a 19ª aqui, porque chega por ALTER). `INSERT` sem lista de
--     colunas e `COPY` posicional não são suportados contra este baseline.
--
-- `codigo_barras text not null` está aqui porque é o que o schema do PostgREST
-- declara, e produção confirma: 0 de 4.271 bens com o campo nulo ou vazio
-- (medido em 09/09/2026).
-- ============================================================================


-- ###########################################################################
-- PASSO 0 · EXTRAÇÃO · seis consultas, UMA DE CADA VEZ, salvando cada saída.
-- Nenhuma altera nada. O baseline fica incompleto até essas saídas entrarem.
-- ###########################################################################

-- 0.a · RODE SOZINHA · policies vivas e estado da RLS.
--       É a consulta que responde a pergunta central: a RLS está ligada?
select c.relname                                              as tabela,
       c.relrowsecurity                                       as rls_ligada,
       c.relforcerowsecurity                                  as rls_forcada,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as qtd_policies
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where  c.relkind = 'r'
  and  c.relname in ('pat_categorias', 'pat_localizacoes', 'pat_bens',
                     'pat_movimentacoes', 'pat_inventarios', 'pat_inventario_itens')
order  by 1;

-- 0.b · RODE SOZINHA · o texto de cada policy viva (o que não pode ser perdido)
select tablename, policyname, cmd, roles::text, qual, with_check
from   pg_policies
where  schemaname = 'public'
  and  tablename in ('pat_categorias', 'pat_localizacoes', 'pat_bens',
                     'pat_movimentacoes', 'pat_inventarios', 'pat_inventario_itens')
order  by tablename, policyname;

-- 0.c · RODE SOZINHA · constraints. Inclui 'f' (estrangeira) e 'p' (primária),
--       que é justamente a classe que um baseline erra sem perceber.
select c.relname as tabela, con.conname, con.contype,
       pg_get_constraintdef(con.oid) as definicao
from   pg_constraint con
join   pg_class c     on c.oid = con.conrelid
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where  c.relname like 'pat\_%' and con.contype in ('c', 'u', 'f', 'p')
order  by 1, 3, 2;

-- 0.d · RODE SOZINHA · índices
select tablename, indexname, indexdef
from   pg_indexes
where  schemaname = 'public' and tablename like 'pat\_%'
order  by 1, 2;

-- 0.e · RODE SOZINHA · triggers (o baseline não tem nenhuma; `updated_at`
--       depende disso para deixar de ser uma coluna morta)
select c.relname as tabela, t.tgname, pg_get_triggerdef(t.oid) as definicao
from   pg_trigger t
join   pg_class c     on c.oid = t.tgrelid
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where  c.relname like 'pat\_%' and not t.tgisinternal
order  by 1, 2;

-- 0.f · RODE SOZINHA · ⚠️ ESTA É A QUE IMPORTA ANTES DE APLICAR.
--       Mostra o privilégio COMPLETO (não só SELECT) que `anon` e
--       `authenticated` têm hoje — exatamente o que o PASSO 2 vai revogar.
--       Se vier tudo `false`, o PASSO 2 é inócuo e o arquivo inteiro é no-op.
select c.relname as tabela,
       has_table_privilege('anon',          c.oid, 'SELECT') as anon_select,
       has_table_privilege('anon',          c.oid, 'INSERT') as anon_insert,
       has_table_privilege('anon',          c.oid, 'UPDATE') as anon_update,
       has_table_privilege('anon',          c.oid, 'DELETE') as anon_delete,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') as auth_delete,
       c.relacl::text                                        as acl_completa
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where  c.relkind = 'r'
  and  c.relname in ('pat_categorias', 'pat_localizacoes', 'pat_bens',
                     'pat_movimentacoes', 'pat_inventarios', 'pat_inventario_itens')
order  by 1;


-- ###########################################################################
-- PASSOS 1 a 4 · VÃO TODOS NUMA COLAGEM SÓ.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- PASSO 1 · A FOTO DO ANTES, e só depois o baseline.
-- É esta tabela temporária que faz o passo 3 ser um no-op garantido.
-- ---------------------------------------------------------------------------
drop table if exists pg_temp._pat_baseline_foto;
create temp table _pat_baseline_foto as
select t.tabela,
       (to_regclass('public.' || t.tabela) is not null) as ja_existia
from  (values ('pat_categorias'), ('pat_localizacoes'), ('pat_bens'),
              ('pat_movimentacoes'), ('pat_inventarios'), ('pat_inventario_itens')
      ) as t(tabela);

-- `SET LOCAL` só vale dentro da transação que o editor abre em volta da
-- colagem — outro motivo para os quatro passos irem juntos.
set local lock_timeout = '5s';

create table if not exists public.pat_categorias (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null,
  pai_id  uuid references public.pat_categorias(id),
  icone   text
  -- vida_util_meses entra em 20260729110000, com o CHECK dela
);

create table if not exists public.pat_localizacoes (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null,
  pai_id  uuid references public.pat_localizacoes(id)
  -- coordenador_id entra em 20260729050000 (FK profiles)
  -- revisao_intervalo_dias / revisao_prazo_dias entram em 20260810170000
);

create table if not exists public.pat_bens (
  id               uuid primary key default gen_random_uuid(),
  codigo_barras    text not null,
  nome             text not null,
  descricao        text,
  categoria_id     uuid references public.pat_categorias(id),
  localizacao_id   uuid references public.pat_localizacoes(id),
  numero_serie     text,
  marca            text,
  modelo           text,
  valor_aquisicao  numeric,
  data_aquisicao   date,
  -- sem FK de propósito: em produção esta coluna NÃO tem chave estrangeira, e
  -- 4.271 de 4.271 bens estão com ela nula (achado RHP-06, medido 09/09/2026).
  nota_fiscal_id   uuid,
  status           text not null default 'ativo',
  foto_url         text,
  observacoes      text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  -- ⚠️ não há trigger de updated_at em nenhuma migration: hoje esta coluna
  -- nasce com now() e nunca mais muda sozinha.
  updated_at       timestamptz not null default now()
  -- localizacao_pendente entra em 20260729100000
  -- alerta_divergencia_item_id entra em 20260729210000 (FK pat_revisao_itens)
  -- numero_nf / tem_garantia / garantia_ate / data_baixa / responsavel_id
  --   entram em 20260729220000 (responsavel_id com FK profiles)
  -- origem_aquisicao / doador / doador_tipo entram em 20260731150000, com CHECK
);

create table if not exists public.pat_movimentacoes (
  id                      uuid primary key default gen_random_uuid(),
  bem_id                  uuid not null references public.pat_bens(id),
  tipo                    text not null,
  localizacao_origem_id   uuid references public.pat_localizacoes(id),
  localizacao_destino_id  uuid references public.pat_localizacoes(id),
  responsavel_id          uuid references public.profiles(id),
  data_movimentacao       timestamptz not null default now(),
  motivo                  text,
  foto_url                text,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now()
  -- revisao_item_id entra em 20260729200000 (FK pat_revisao_itens ON DELETE SET NULL)
);

create table if not exists public.pat_inventarios (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  data_inicio     date not null,
  data_fim        date,
  responsavel_id  uuid references public.profiles(id),
  status          text not null default 'em_andamento',
  observacoes     text,
  created_at      timestamptz not null default now()
);

create table if not exists public.pat_inventario_itens (
  id                      uuid primary key default gen_random_uuid(),
  inventario_id           uuid not null references public.pat_inventarios(id),
  bem_id                  uuid not null references public.pat_bens(id),
  localizado              boolean,
  localizacao_encontrada  uuid references public.pat_localizacoes(id),
  divergencia             text,
  conferido_por           uuid references public.profiles(id),
  conferido_em            timestamptz
);

-- ---------------------------------------------------------------------------
-- PASSO 2 · PORTA FECHADA PARA OS PAPÉIS DE CLIENTE. Roda nas seis, SEMPRE,
-- inclusive em produção. É a única mudança que este arquivo faz lá.
--
-- Em ambiente novo é o que impede as tabelas de nascerem abertas: o Supabase
-- concede acesso a `anon` e `authenticated` por padrão.
--
-- `from public, anon, authenticated`, com o PUBLIC junto: revoke só de anon é
-- INERTE quando o privilégio vem de PUBLIC. É a armadilha que já mordeu esta
-- série, e o 20260906115900 desta mesma leva escreve assim. Medido em
-- 09/09/2026: com o privilégio vindo de PUBLIC, a forma sem `public` deixa
-- `anon` e `authenticated` lendo; a forma com `public` fecha os dois.
-- Lembre que REVOKE só apaga privilégio concedido pelo papel que executa; se o
-- PASSO 4 voltar com privilégio ainda de pé, repita como `supabase_admin`.
-- ---------------------------------------------------------------------------
do $$
declare
  t     text;
  alvos text[] := array[
    'pat_categorias', 'pat_localizacoes', 'pat_bens',
    'pat_movimentacoes', 'pat_inventarios', 'pat_inventario_itens'
  ];
begin
  foreach t in array alvos loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  raise notice 'RHP-05 passo 2: grants de cliente revogados e service_role garantido em % tabelas', array_length(alvos, 1);
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3 · RLS E POLICIES · SÓ NAS TABELAS QUE ESTE ARQUIVO ACABOU DE CRIAR.
--
-- É a trava do no-op. Em produção as seis já existiam (o passo 1 registrou),
-- então este bloco não liga RLS nem cria policy, e diz isso no NOTICE.
--
-- Molde para ambiente novo, IGUAL ao de `log_compras` e ao do arquivo irmão da
-- logística: leitura exige o módulo, escrita exige nível 2, apagar é
-- super-admin. Usar a mesma régua nos dois módulos é deliberado — não há
-- precedente próprio no patrimônio, e duas réguas diferentes escritas no mesmo
-- dia viram pergunta sem resposta para quem ler depois.
--
-- Níveis conferidos em 09/09/2026: patrimônio tem 2 cargos em nível 5, 4 em
-- nível 4 e 8 em nível 1, e ninguém em 2 nem em 3 — então `>= 2` seleciona
-- hoje exatamente as mesmas pessoas que `>= 3` selecionaria. E o cargo
-- "Membro" não tem linha no módulo, então `>= 1` não alcança a base inteira.
--
-- ⚠️ Estas quatro policies de `authenticated` são a ESCADA para o dia em que
-- alguém conceder GRANT. Hoje o PASSO 2 revoga tudo de propósito, porque
-- nenhum cliente lê `pat_*` por PostgREST (conferido: não há `from('pat_` no
-- front web nem no app, e todas as rotas de patrimônio usam service_role).
-- Elas não são avaliadas enquanto não houver GRANT, e isso é intencional.
-- ---------------------------------------------------------------------------
do $$
declare
  t       text;
  n_novas int := 0;
  n_pulou int := 0;
  alvos   text[] := array[
    'pat_categorias', 'pat_localizacoes', 'pat_bens',
    'pat_movimentacoes', 'pat_inventarios', 'pat_inventario_itens'
  ];
begin
  if to_regclass('pg_temp._pat_baseline_foto') is null then
    raise exception 'PARE: a foto do PASSO 1 nao existe. Cole os PASSOS 1 a 4 juntos, numa colagem so.';
  end if;

  foreach t in array alvos loop
    -- coalesce(..., true) = falha para o lado seguro: linha faltando na foto
    -- é tratada como "já existia", e o bloco não toca na tabela.
    if coalesce((select ja_existia from _pat_baseline_foto where tabela = t), true) then
      n_pulou := n_pulou + 1;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (public.current_user_module_level('patrimonio') >= 1)
    $f$, t || '_select', t);

    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (public.current_user_module_level('patrimonio') >= 2)
    $f$, t || '_insert', t);

    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (public.current_user_module_level('patrimonio') >= 2)
        with check (public.current_user_module_level('patrimonio') >= 2)
    $f$, t || '_update', t);

    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (public.is_super_admin())
    $f$, t || '_delete', t);

    execute format($f$
      create policy %I on public.%I
        for all to service_role using (true) with check (true)
    $f$, t || '_service', t);

    n_novas := n_novas + 1;
  end loop;

  if n_novas = 0 then
    raise notice 'PRODUCAO CONFIRMADA: as % tabelas ja existiam. Nenhuma RLS ligada, nenhuma policy criada. Falta incorporar a saida do PASSO 0 ao baseline.', n_pulou;
  else
    raise notice 'AMBIENTE NOVO: % tabela(s) criadas agora receberam RLS + 5 policies · % ja existiam e nao foram tocadas', n_novas, n_pulou;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- COMENTÁRIOS · antes da conferência, porque o SQL Editor mostra o resultado
-- do ÚLTIMO comando e a conferência é a prova.
-- ---------------------------------------------------------------------------
comment on table public.pat_bens is
  'Bens do Patrimonio. Baseline trazido ao git em 09/09/2026 pela varredura (achado RHP-05): a tabela existia em producao desde antes, criada fora de migration. Colunas ORIGINAIS reconstruidas do schema publicado pelo PostgREST; as acrescentadas por migrations posteriores ficam com elas, para nao anular o ADD COLUMN IF NOT EXISTS e perder as FKs. CHECK, UNIQUE, indice e trigger nao estao neste arquivo, e a ordem ordinal das colunas difere de producao.';
comment on column public.pat_bens.nota_fiscal_id is
  'Nota fiscal de aquisicao. Sem FK e 100% nula em 09/09/2026 (4.271 de 4.271 bens) — achado RHP-06 da varredura.';

-- ---------------------------------------------------------------------------
-- PASSO 4 · CONFERÊNCIA.
-- Esperado EM PRODUÇÃO: 6 linhas com `qtd_policies` igual ao que a 0.a
-- mostrou, `rls_ligada` igual ao que a 0.a mostrou, e as colunas de
-- privilégio todas `false`. Compare coluna a coluna com a 0.a e a 0.f — as
-- três consultas usam a MESMA lista de seis tabelas, de propósito.
-- Se `qtd_policies` ou `rls_ligada` mudou, alguma coisa fez o que não devia.
-- ---------------------------------------------------------------------------
select c.relname as tabela,
       c.relrowsecurity                                       as rls_ligada,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as qtd_policies,
       has_table_privilege('anon',          c.oid, 'SELECT') as anon_select,
       has_table_privilege('anon',          c.oid, 'INSERT') as anon_insert,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') as auth_delete
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where  c.relkind = 'r'
  and  c.relname in ('pat_categorias', 'pat_localizacoes', 'pat_bens',
                     'pat_movimentacoes', 'pat_inventarios', 'pat_inventario_itens')
order  by 1;


-- ###########################################################################
-- PASSO 5 · RODE SOZINHO, DEPOIS DE APLICAR.
--
-- Este arquivo é colado à mão no SQL Editor, então ele NÃO entra sozinho em
-- `supabase_migrations.schema_migrations`. E o carimbo dele (20260623000000) é
-- três meses mais antigo que a última migration aplicada. Sem registrar, um
-- `supabase db push` futuro vê uma migration não registrada e mais velha que o
-- histórico, e pode tentar rodá-la de novo. Nada catastrófico — tudo aqui é
-- `if not exists` —, mas é ruído evitável.
-- ###########################################################################
insert into supabase_migrations.schema_migrations (version)
values ('20260623000000')
on conflict do nothing;
