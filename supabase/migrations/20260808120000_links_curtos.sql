-- ════════════════════════════════════════════════════════════════════════════
--  LINKS CURTOS · QR code que não precisa ser reimpresso
--
--  O PROBLEMA (Matheus, 08/08): todo QR do sistema grava a URL FINAL. Quando o
--  destino muda — a pesquisa virou outra, o formulário mudou de endereço, o
--  culto trocou de link — os cartazes, banners e adesivos já impressos apontam
--  para o lugar errado. A única saída era reimprimir tudo.
--
--  A SOLUÇÃO é uma indireção: o QR grava `cbrio.org/r/<slug>`, que é um
--  endereço nosso e ESTÁVEL. O destino fica no banco e pode mudar quantas vezes
--  quiser. O papel nunca mais precisa ser refeito.
--
--  ⚠️ LIMITE HONESTO: isto vale para os QRs daqui pra frente. Um QR já impresso
--  gravou a URL final no próprio desenho — não existe como alcançá-lo de fora.
--  Os que já estão na rua continuam apontando para onde apontam.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.link_curto (
  id          uuid primary key default gen_random_uuid(),
  -- O que vai no QR: cbrio.org/r/<slug>. Curto e minúsculo de propósito — quem
  -- digita à mão erra menos, e QR curto tem menos módulos e lê de mais longe.
  slug        text not null unique
              check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  titulo      text not null,
  descricao   text,
  -- Onde o QR leva HOJE. É a única coluna que se espera ver mudando.
  destino     text not null check (destino ~* '^https?://'),
  -- Desligar em vez de apagar: um QR impresso com slug apagado viraria 404 sem
  -- explicação. Desligado, dá para mostrar uma página dizendo o que aconteceu.
  ativo       boolean not null default true,
  -- Onde este QR está fisicamente ("banner da entrada", "verso do cartão").
  -- Sem isto, daqui a seis meses ninguém lembra qual papel usa qual slug — e o
  -- link vira intocável por medo de quebrar algo que ninguém sabe onde está.
  onde        text,
  criado_por  uuid references public.profiles(id) on delete set null,
  atualizado_por uuid references public.profiles(id) on delete set null,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists link_curto_slug_idx on public.link_curto (slug) where deleted_at is null;

-- ── Histórico do destino ───────────────────────────────────────────────────
-- O ponto todo da feature é o destino mudar. Sem histórico, "esse QR levava
-- para onde no mês passado?" fica sem resposta — e é exatamente a pergunta que
-- aparece quando algo dá errado.
create table if not exists public.link_curto_destino_hist (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.link_curto(id) on delete cascade,
  destino_antigo text,
  destino_novo   text not null,
  alterado_por   uuid references public.profiles(id) on delete set null,
  alterado_em    timestamptz not null default now()
);
create index if not exists link_curto_hist_idx on public.link_curto_destino_hist (link_id, alterado_em desc);

-- ── Acessos ────────────────────────────────────────────────────────────────
-- Uma linha por escaneamento. Não guarda quem: sem IP, sem cookie, sem id de
-- pessoa. Guarda o suficiente para responder "qual cartaz funciona" — que é a
-- pergunta que o Matheus quer responder — e nada além disso.
create table if not exists public.link_curto_acesso (
  id         bigserial primary key,
  link_id    uuid not null references public.link_curto(id) on delete cascade,
  em         timestamptz not null default now(),
  -- 'celular' | 'computador' | 'outro' — derivado do user-agent, não o UA cru.
  aparelho   text,
  -- Domínio de onde veio (quando o leitor manda referer). Nunca a URL inteira.
  origem     text
);
create index if not exists link_curto_acesso_idx on public.link_curto_acesso (link_id, em desc);

-- Contagem por dia. A tela quase sempre quer isto, não as linhas cruas.
create or replace view public.vw_link_curto_stats as
select l.id as link_id, l.slug, l.titulo, l.destino, l.ativo, l.onde,
       count(a.id)                                          as acessos,
       count(a.id) filter (where a.em > now() - interval '7 days')  as acessos_7d,
       count(a.id) filter (where a.em > now() - interval '30 days') as acessos_30d,
       max(a.em)                                            as ultimo_acesso,
       l.criado_em, l.atualizado_em
  from public.link_curto l
  left join public.link_curto_acesso a on a.link_id = l.id
 where l.deleted_at is null
 group by l.id;

alter table public.link_curto enable row level security;
alter table public.link_curto_destino_hist enable row level security;
alter table public.link_curto_acesso enable row level security;

drop policy if exists link_curto_sel on public.link_curto;
create policy link_curto_sel on public.link_curto for select to authenticated
  using (public.current_user_module_level('links') >= 1);
drop policy if exists link_curto_svc on public.link_curto;
create policy link_curto_svc on public.link_curto for all to service_role
  using (true) with check (true);

drop policy if exists link_curto_hist_sel on public.link_curto_destino_hist;
create policy link_curto_hist_sel on public.link_curto_destino_hist for select to authenticated
  using (public.current_user_module_level('links') >= 1);
drop policy if exists link_curto_hist_svc on public.link_curto_destino_hist;
create policy link_curto_hist_svc on public.link_curto_destino_hist for all to service_role
  using (true) with check (true);

drop policy if exists link_curto_acesso_sel on public.link_curto_acesso;
create policy link_curto_acesso_sel on public.link_curto_acesso for select to authenticated
  using (public.current_user_module_level('links') >= 1);
drop policy if exists link_curto_acesso_svc on public.link_curto_acesso;
create policy link_curto_acesso_svc on public.link_curto_acesso for all to service_role
  using (true) with check (true);

grant select on public.vw_link_curto_stats to authenticated;

-- ── Módulo ─────────────────────────────────────────────────────────────────
insert into public.modulos (nome, slug, rota, categoria, descricao, ativo, ordem)
select 'Links e QR', 'links', '/links', 'admin_dados',
       'QR codes dinâmicos: o papel impresso aponta para um endereço estável e o destino muda quando você quiser.',
       true, 340
 where not exists (select 1 from public.modulos where slug = 'links');

-- Registrar o módulo não dá acesso a ninguém — a matriz cargo × módulo é que
-- dá. Copio do `censo` como ponto de partida: quem já administra pesquisa é
-- quem já mexe com QR de culto. Ajustável depois em /admin/permissoes.
do $$
declare base_id int;
begin
  select id into base_id from public.modulos where slug = 'censo';
  if base_id is not null then
    insert into public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    select cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      from public.cargo_modulo_permissao cmp
      cross join public.modulos novo
     where cmp.modulo_id = base_id and novo.slug = 'links'
    on conflict (cargo_id, modulo_id) do nothing;
  end if;
end $$;

comment on table public.link_curto is
  'Links curtos de cbrio.org/r/<slug>. Existem para que um QR impresso nunca precise ser reimpresso: o slug e o papel ficam; o destino muda no banco.';
