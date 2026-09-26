-- ============================================================================
-- LINK DA SALA do grupo ONLINE · `mem_grupo_link` (2026-09-25)
--
-- Pedido do Matheus depois de medir o inbox do WhatsApp: duas das perguntas
-- mais frequentes são **"em que plataforma ocorre o encontro?"** e **"recebo o
-- link por aqui?"** — e o sistema NÃO SABIA responder. Medido em 25/09:
-- `mem_grupos` não tinha nenhuma coluna de link ou plataforma, com **36 grupos
-- online ativos** (33% dos 109). Nenhuma IA conserta isso: é campo que não
-- existe no cadastro.
--
-- ============================================================================
-- ⚠️⚠️ POR QUE TABELA PRÓPRIA E NÃO UMA COLUNA EM `mem_grupos`
--
-- A primeira versão desta migration criou `mem_grupos.link_online` — e o
-- CATÁLOGO derrubou a premissa. Eu esperava que coluna nova nascesse sem
-- privilégio (a lei de 17/09 registra que `authenticated` teria uma lista de 34
-- colunas). Medido em 25/09, o que existe é **GRANT DE TABELA completo** para
-- `anon` E `authenticated`: DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE — nas 37 colunas. A lista de 34 colunas **não está mais em
-- vigor** (algum `GRANT ... ON ALL TABLES` posterior a desfez).
--
-- E com GRANT de TABELA, **revogar por COLUNA não tem efeito** — é a lei nº 11
-- do projeto, escrita em 16/08 a partir do incidente do `profiles`. Tentei o
-- `REVOKE ... (link_online)` e conferi no catálogo: os 8 privilégios seguiram lá.
--
-- ⇒ O link é a CREDENCIAL DE ENTRADA da sala: quem tem o link, entra. Deixá-lo
-- em `mem_grupos` o tornaria legível por qualquer conta do app de membros — e o
-- signup do provedor de auth está aberto. Aqui ele vive numa tabela cuja única
-- policy é `service_role`, então sai **apenas pelo backend**, por construção,
-- sem depender de restaurar grant nenhum.
--
-- Os dois caminhos de saída, ambos controlados:
--   1. o aviso de "pedido APROVADO" (só quem foi aceito recebe);
--   2. a tela de gestão de grupos do ERP, atrás de `authorizeModule('grupos')`.
--
-- ⚠️ Se um dia a tela do LÍDER no app precisar do link, o caminho é endpoint
-- com `gateGrupoApp` — NUNCA um GRANT nesta tabela.
-- ============================================================================

create table if not exists public.mem_grupo_link (
  grupo_id       uuid primary key references public.mem_grupos(id) on delete cascade,
  link           text not null,
  plataforma     text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null,
  -- Só https, e com teto: link é parâmetro de template do WhatsApp, e corpo de
  -- template tem limite de tamanho.
  constraint chk_mem_grupo_link_https check (link ~* '^https://[^[:space:]]{4,500}$')
);

comment on table public.mem_grupo_link is
  'Link da sala do grupo ONLINE. Tabela propria (e nao coluna em mem_grupos) porque mem_grupos tem '
  'GRANT DE TABELA para anon/authenticated: o link e a credencial de entrada da sala e nao pode ser '
  'legivel por qualquer conta do app. Sai so pelo backend. Ver 20260925180000.';

alter table public.mem_grupo_link enable row level security;

-- ⚠️ Sem policy para `authenticated` nem `anon`, de propósito: RLS nega por
-- padrão, e é isso que faz a proteção não depender do estado dos grants.
create policy mem_grupo_link_service on public.mem_grupo_link
  for all to service_role using (true) with check (true);

revoke all on public.mem_grupo_link from anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO (rodar depois · no CATÁLOGO, nunca no "success: true")
-- ============================================================================
-- select
--   (select relrowsecurity from pg_class where oid='public.mem_grupo_link'::regclass) as rls,
--   (select count(*) from pg_policies where tablename='mem_grupo_link' and roles::text ~ 'authenticated|anon') as policies_publicas,
--   (select count(*) from information_schema.table_privileges where table_name='mem_grupo_link' and grantee in ('anon','authenticated')) as grants_publicos;
--   -> esperado: true · 0 · 0
