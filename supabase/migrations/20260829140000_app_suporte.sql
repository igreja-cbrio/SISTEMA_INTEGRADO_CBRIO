-- ============================================================================
-- AJUDA COM O APP · a dúvida do membro chega em quem cuida do app
-- ============================================================================
-- Pedido do Matheus (29/08/2026): *"no app, no menu, tivesse um botão de ajuda
-- com app, caso a pessoa precise tirar dúvidas em relação ao app, seus dados e
-- etc. Essas dúvidas devem chegar para o meu WhatsApp... quero o nome da pessoa
-- e a dúvida dela, com o número de celular dela."*
--
-- ⚠️⚠️ ISTO NÃO É A PORTA "FALAR COM A CBRIO" (`app_inscricoes` tipo
-- `contato`), e a diferença é de DESTINO: aquela é fila PASTORAL (Cuidados) e
-- esta é SUPORTE do produto. "Meu grupo não aparece no app" não é assunto da
-- equipe de cuidado, e misturar as duas enche a fila pastoral de bug report.
--
-- ⚠️ O DONO DO FLUXO VIVE NO BANCO (lei do projeto: nunca nomear pessoa como
-- dono no código). `whatsapp_config.suporte_app_membro_id` é semeada aqui e
-- muda com UM update, sem PR:
--     update public.whatsapp_config
--        set suporte_app_membro_id = '<membro>'::uuid where id = 1;
-- ============================================================================

-- 1) Onde a dúvida FICA GRAVADA ---------------------------------------------
-- ⚠️ A tabela existe pra a dúvida não depender do WhatsApp ter saído: canal é
-- entrega, registro é memória. Sem ela, template não aprovado = dúvida perdida.
create table if not exists public.app_suporte_mensagens (
  id           uuid primary key default gen_random_uuid(),
  -- ⚠️ FK obrigatória (lei nº 10): sem ela `merge_membros` não reponta esta
  -- linha ao fundir duplicata, e ela vira ponteiro morto em silêncio.
  membro_id    uuid references public.mem_membros(id) on delete set null,
  -- ⚠️ SNAPSHOT, sem FK pra auth.users de propósito: `on delete cascade` faria
  -- apagar a conta apagar a PROVA de que a pessoa pediu ajuda.
  user_id      uuid,
  nome         text not null,
  telefone     text,
  mensagem     text not null,
  app_versao   text,
  plataforma   text,
  enviado_em   timestamptz,          -- quando o WhatsApp foi ENFILEIRADO
  tratado_em   timestamptz,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_app_suporte_ativas
  on public.app_suporte_mensagens (created_at desc) where deleted_at is null;

comment on table public.app_suporte_mensagens is
  'Dúvidas sobre o APP (suporte do produto), não fila pastoral. O destinatário vive em whatsapp_config.suporte_app_membro_id.';

alter table public.app_suporte_mensagens enable row level security;

-- ⚠️ Nenhuma policy pra `authenticated`: quem escreve é o backend com
-- service_role. Dar INSERT ao cliente abriria a tabela à anon key do bundle.
drop policy if exists app_suporte_service on public.app_suporte_mensagens;
create policy app_suporte_service on public.app_suporte_mensagens
  for all to service_role using (true) with check (true);

drop policy if exists app_suporte_super on public.app_suporte_mensagens;
create policy app_suporte_super on public.app_suporte_mensagens
  for select to authenticated using (public.is_super_admin());

-- 2) Whitelist de soft-delete · PATCH DINÂMICO sobre a definição VIVA --------
-- ⚠️⚠️ NUNCA reescrever a lista à mão: prod tem entradas que chegaram por patch
-- e um CREATE OR REPLACE estático as apagaria em silêncio (incidente 17/08 —
-- o sintoma aparece meses depois, noutro módulo, como "erro ao excluir").
do $$
declare v_lista text[];
begin
  select array_agg(t order by t) into v_lista
  from (
    select unnest(public.app_soft_deletable_tables()) as t
    union select 'app_suporte_mensagens'
  ) s;

  execute format(
    'create or replace function public.app_soft_deletable_tables() returns text[] language sql immutable as $f$ select %L::text[] $f$',
    v_lista
  );

  if not ('app_suporte_mensagens' = any(public.app_soft_deletable_tables())) then
    raise exception 'whitelist nao recebeu app_suporte_mensagens';
  end if;
  raise notice 'whitelist agora com % tabelas', array_length(public.app_soft_deletable_tables(), 1);
end $$;

-- 3) QUEM recebe ------------------------------------------------------------
alter table public.whatsapp_config
  add column if not exists suporte_app_membro_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'whatsapp_config_suporte_app_membro_fk'
  ) then
    alter table public.whatsapp_config
      add constraint whatsapp_config_suporte_app_membro_fk
      foreign key (suporte_app_membro_id) references public.mem_membros(id) on delete set null;
  end if;
end $$;

comment on column public.whatsapp_config.suporte_app_membro_id is
  'Quem recebe as dúvidas de "Ajuda com o app". Trocar aqui muda o destinatário sem deploy. NULL = ninguém recebe por WhatsApp (a dúvida ainda é gravada e notifica o módulo).';

-- Semeia o dono ATUAL a partir do cadastro (dado, não nome em código).
-- ⚠️ Só-onde-vazio: se alguém já configurou outro destinatário, não sobrescreve.
update public.whatsapp_config c
   set suporte_app_membro_id = (
     select p.membro_id from public.profiles p
      where lower(p.email) = 'matheus.toscano@cbrio.org' and p.membro_id is not null
      limit 1
   )
 where c.suporte_app_membro_id is null;
