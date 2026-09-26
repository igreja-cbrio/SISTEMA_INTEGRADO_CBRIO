-- ============================================================================
-- PEDIDO DO LINK DA SALA pelo WhatsApp → aviso à LIDERANÇA · `wa_grupo_link_pedidos`
-- (2026-09-26)
--
-- Pedido do Matheus (item 4): *"a resposta dizendo que a líder vai mandar [o
-- link] é ótimo, mas preciso que o líder seja avisado que tal pessoa está
-- solicitando o link do grupo"*.
--
-- O gancho determinístico do webhook (`services/pedidoLinkGrupo.js`) reconhece
-- "cadê o link do meu grupo?", descobre o grupo ONLINE da pessoa e avisa quem
-- responde por ele (sino do ERP, app do membro e WhatsApp com template). Esta
-- tabela é a REIVINDICAÇÃO do aviso: uma linha por (conversa, grupo, dia BRT).
--
-- ⚠️⚠️ POR QUE A DEDUP É UMA UNIQUE E NÃO UM "SELECT ANTES DO INSERT"
-- O webhook roda em paralelo e a Meta REENTREGA eventos. Com SELECT-depois-
-- INSERT, duas execuções concorrentes veem as duas "ainda não avisei" e a líder
-- recebe dois WhatsApps iguais — o padrão que a Meta lê como spam. Quem
-- consegue INSERIR a linha é quem avisa; quem bate no 23505 sabe que já foi
-- avisado hoje e só responde à pessoa (é a lei de 04/08: a guarda de
-- idempotência tem que ser A MESMA CHAVE do índice).
--
-- ⚠️ `UNIQUE` SEM PREDICADO de propósito: índice PARCIAL não serve a `ON
-- CONFLICT` nem à reivindicação por INSERT (lei de 04/08 · `mem_censo_convites`).
-- Seguro porque as três colunas são NOT NULL.
--
-- ⚠️⚠️ ESTA TABELA NÃO GUARDA O LINK. O link da sala mora em `mem_grupo_link`
-- (20260925180000), é CREDENCIAL DE ENTRADA e o bot NUNCA o envia: a identidade
-- da conversa de WhatsApp é fraca (sufixo de 8 dígitos, 744 telefones
-- compartilhados por família). Quem entrega o link é a liderança.
--
-- ⚠️ `membro_id` tem FK (lei nº 10 · sem ela `merge_membros` não reponta a linha
-- ao fundir duplicata) e está em `fusaoVerificacao.TABELAS_COM_MEMBRO`.
-- `lider_id` idem: é FK, e o `merge_membros` descobre pelo catálogo.
--
-- ⚠️ `canais` registra o que saiu por onde (`enviado` · `na_fila` ·
-- `sem_destinatario` · `template_nao_aprovado` · `desligado` · …). É ela que
-- decide se a resposta à pessoa pode dizer "já avisamos a liderança" — só com
-- pelo menos um canal `enviado`.
--
-- ⚠️ O código TOLERA a tabela ausente (42P01): não reivindica ⇒ não avisa a
-- liderança, mas ainda responde à pessoa com o texto de sempre ("a liderança
-- vai entrar em contato"). Deploy e migration podem chegar em qualquer ordem.
-- ============================================================================

create table if not exists public.wa_grupo_link_pedidos (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.wa_conversas(id) on delete cascade,
  grupo_id uuid not null references public.mem_grupos(id) on delete cascade,
  membro_id uuid references public.mem_membros(id) on delete set null,
  lider_id uuid references public.mem_membros(id) on delete set null,
  dia_brt date not null,
  canais jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  constraint uq_wa_grupo_link_pedidos_dia unique (conversa_id, grupo_id, dia_brt)
);

create index if not exists idx_wa_grupo_link_pedidos_grupo
  on public.wa_grupo_link_pedidos (grupo_id, criado_em desc);

comment on table public.wa_grupo_link_pedidos is
  'Pedido do link da sala do grupo ONLINE feito pelo WhatsApp da CBRio: 1 linha por (conversa, grupo, dia BRT). '
  'E a REIVINDICACAO do aviso a lideranca (quem insere avisa; 23505 = ja avisado hoje). NAO guarda o link. '
  'canais = o que saiu por onde. Ver 20260926120000 e services/pedidoLinkGrupo.js.';
comment on column public.wa_grupo_link_pedidos.dia_brt is
  'Dia em BRT (America/Sao_Paulo), nunca o dia UTC: das 21h em diante o UTC ja virou e o aviso sairia 2x no mesmo dia.';
comment on column public.wa_grupo_link_pedidos.canais is
  'Resultado por canal (sino, app, whatsapp). So "enviado" conta como aviso que saiu.';

alter table public.wa_grupo_link_pedidos enable row level security;

-- ⚠️ Só o backend (service_role) lê e escreve. Sem policy para `authenticated`
-- nem `anon`: RLS nega por padrão, e o revoke abaixo tira o grant de tabela que
-- um `GRANT ... ON ALL TABLES` posterior poderia ter posto (o caso de
-- `mem_grupos`, medido em 25/09).
drop policy if exists wa_grupo_link_pedidos_service on public.wa_grupo_link_pedidos;
create policy wa_grupo_link_pedidos_service on public.wa_grupo_link_pedidos
  for all to service_role using (true) with check (true);

revoke all on public.wa_grupo_link_pedidos from anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO (rodar depois · no CATÁLOGO, nunca no "success: true")
-- ============================================================================
-- select
--   (select relrowsecurity from pg_class where oid = 'public.wa_grupo_link_pedidos'::regclass) as rls,
--   (select count(*) from pg_policies where tablename = 'wa_grupo_link_pedidos'
--      and roles::text ~ 'authenticated|anon') as policies_publicas,
--   (select count(*) from information_schema.table_privileges
--      where table_name = 'wa_grupo_link_pedidos' and grantee in ('anon', 'authenticated')) as grants_publicos,
--   (select count(*) from pg_constraint where conname = 'uq_wa_grupo_link_pedidos_dia') as unique_do_dia,
--   (select count(*) from pg_constraint where conrelid = 'public.wa_grupo_link_pedidos'::regclass
--      and contype = 'f') as fks;
--   -> esperado: true · 0 · 0 · 1 · 4
