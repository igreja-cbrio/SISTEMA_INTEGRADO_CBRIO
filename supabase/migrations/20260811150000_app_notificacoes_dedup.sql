-- ============================================================================
-- SINO DO APP · dedup por FATO, não por instante (2026-08-11)
--
-- Pré-requisito pra ligar o aviso de grupo no app (item 3 dos 16 apontamentos,
-- autorizado pelo Marcos: *"pode ligar claude"*).
--
-- ⚠️⚠️ `app_notificacoes` NÃO TINHA DEDUP NENHUM — nem coluna. A tabela irmã do
-- ERP (`notificacoes`) tem `chave_dedup` desde sempre, e é ela que impede o sino
-- de virar ruído; a do app nasceu sem. Consequência: qualquer reprocessamento
-- duplica o aviso na mão da pessoa, e não havia como escrever escritor
-- idempotente.
--
-- ⚠️⚠️ O QUE ESTA CHAVE **NÃO** RESOLVE, pra ninguém se enganar: a Edge Function
-- `notify-grupo-pedido` está **DEPLOYADA** (sondada em 11/08: responde 401
-- `UNAUTHORIZED_NO_AUTH_HEADER`, não 404) e hoje não produz nada — 825 linhas em
-- `app_notificacoes`, ZERO de tipo grupo, contra 459 pedidos desde 01/07. Se
-- alguém configurar o webhook dela, o aviso **VAI DUPLICAR MESMO ASSIM**: ela
-- insere por `_shared/notify.ts`, que não escreve `chave_dedup`, e NULL nunca
-- conflita (NULLS DISTINCT). Fechar aquele caminho exige mexer nela ou derrubar
-- o trigger — ver o diagnóstico no fim deste arquivo.
-- O que a chave resolve é o NOSSO caminho: reenvio de formulário, retry e
-- reprocessamento param de gerar aviso repetido.
--
-- ⚠️⚠️ O ÍNDICE É **ÚNICO E SEM PREDICADO**, de propósito. `ON CONFLICT` do
-- PostgREST **não infere índice PARCIAL** (lição de 04/08, `mem_censo_convites`):
-- o Postgres exige que o statement repita o predicado, e o `upsert()` do
-- supabase-js não expressa isso — com índice parcial o upsert estouraria
-- "there is no unique or exclusion constraint matching...".
--
-- ⚠️ E índice sem predicado é seguro aqui porque `NULLS DISTINCT` é o padrão do
-- Postgres: as 825 linhas legadas (todas com `chave_dedup` NULO) e os avisos que
-- não têm fato único (devocional do dia, culto) nunca conflitam entre si. Por
-- isso também o escritor só usa `upsert` quando TEM chave.
--
-- ⚠️ A tabela é do SCHEMA DO APP (`Aplicativo-CBRio/supabase/notificacoes.sql`),
-- que é **cópia de leitura**. A fonte que roda são as migrations do ERP — é esta.
-- ============================================================================

alter table public.app_notificacoes
  add column if not exists chave_dedup text;

comment on column public.app_notificacoes.chave_dedup is
  'Amarra o aviso ao FATO (ex.: grupo_pedido:<uuid do pedido>), não ao instante. '
  'NULO = aviso sem fato único (devocional do dia, culto) e nunca conflita. '
  'Escrito por backend/services/appPush.js notificarApp({chaveDedup}).';

-- Alvo do ON CONFLICT do escritor. SEM predicado, de propósito (ver cabeçalho).
create unique index if not exists uq_app_notificacoes_dedup
  on public.app_notificacoes (user_id, chave_dedup);

-- ── Conferência (o SQL Editor não mostra RAISE NOTICE) ─────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'app_notificacoes' and column_name = 'chave_dedup';
-- select indexname, indexdef from pg_indexes
--  where tablename = 'app_notificacoes' and indexname = 'uq_app_notificacoes_dedup';

-- ============================================================================
-- ⚠️⚠️ DIAGNÓSTICO QUE PRECISA DE OLHO HUMANO (NÃO faz parte da migration)
--
-- Não consegui ler `pg_trigger` daqui (a senha do `DATABASE_URL` local é
-- recusada — já registrado no CLAUDE.md). Rodar isto e me dizer o resultado:
--
--   select tgname, tgenabled
--     from pg_trigger
--    where tgrelid = 'public.mem_grupo_pedidos'::regclass
--      and not tgisinternal;
--
-- Se aparecer algum trigger com `tgenabled = 'O'` (habilitado) apontando pra a
-- Edge Function `notify-grupo-pedido`, ele deve ser DERRUBADO — e não é
-- preciosismo: `notify-grupo-pedido/index.ts:62-65` acrescenta **TODOS** os
-- admin/diretor sem filtrar `active` nem conta de serviço, o que com 459 pedidos
-- daria ~7.800 linhas e traria os robôs `agente.*` de volta pro sino. É o
-- incidente dos 16.646 avisos não lidos (10/08) reencenado dentro do app.
--
-- NÃO derrubei por conta própria: derrubar trigger é mudança de schema em
-- produção, e este produz efeito ZERO hoje.
-- ============================================================================
