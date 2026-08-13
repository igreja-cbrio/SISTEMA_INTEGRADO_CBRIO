-- ════════════════════════════════════════════════════════════════════════════
--  CENSO · registro de convites (quem já foi chamado para atualizar cadastro)
--
--  Pedido do Matheus (04/08): disparar WhatsApp + e-mail para quem NÃO tem CPF
--  cadastrado mas tem celular ou e-mail, pedindo a atualização dos dados pelo
--  link do cadastro de membresia.
--
--  ⚠️ POR QUE UMA TABELA, e não só o `whatsapp_envios`:
--     - o `whatsapp_envios` registra a entrega do WhatsApp, mas NÃO cobre o
--       e-mail (o canal Graph não tem fila nem log próprio);
--     - "reenviar só para quem não respondeu" precisa saber quem JÁ foi
--       convidado, por qual canal e em qual rodada. Sem isso, o segundo disparo
--       manda de novo para todo mundo — que é exatamente como uma campanha
--       legítima vira spam e derruba a nota de qualidade da conta na Meta.
--
--  ⚠️ NÃO guarda telefone nem e-mail: o contato é o que está em `mem_membros` e
--     muda quando a pessoa corrige. Copiar aqui criaria uma segunda verdade que
--     envelhece (mesma régua do `contatoPessoa`: não gravar o que é derivável).
--     Por isso a tabela não tem PII própria e fica FORA da whitelist de
--     soft-delete — apagar a linha só faz a pessoa poder ser convidada de novo.
--
--  Aditiva e idempotente. Aplicar antes do merge: o backend responde AVISO (não
--  500) enquanto ela não existir, mas o disparo fica indisponível até lá.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.mem_censo_convites (
  id          uuid primary key default gen_random_uuid(),
  membro_id   uuid,
  canal       text        not null,
  rodada      integer     not null default 1,
  enviado_em  timestamptz not null default now(),
  enviado_por uuid,
  ok          boolean     not null default true,
  erro        text,
  created_at  timestamptz not null default now()
);

comment on table  public.mem_censo_convites is
  'Convites do censo (atualização cadastral) enviados por WhatsApp/e-mail. Sem PII própria: o contato vive em mem_membros.';
comment on column public.mem_censo_convites.rodada is
  'Reenvio = rodada nova. UNIQUE(membro_id,canal,rodada) impede mandar 2x na mesma rodada.';
comment on column public.mem_censo_convites.enviado_por is
  'SNAPSHOT do profile que disparou, SEM FK: a prova de quem disparou não pode sumir com o profile (lição do ledger append-only do check-in).';
comment on column public.mem_censo_convites.ok is
  'false = o canal recusou na hora (telefone inalcançável, Graph falhou). A entrega do WhatsApp em si vive em whatsapp_envios.';

-- CHECK do canal em bloco próprio (idempotente · nome estável)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mem_censo_convites'::regclass
       and conname  = 'chk_mem_censo_convites_canal'
  ) then
    alter table public.mem_censo_convites
      add constraint chk_mem_censo_convites_canal
      check (canal in ('whatsapp', 'email'));
  end if;
end $$;

-- ⚠️ FK em ALTER separado, NUNCA dentro de ADD COLUMN IF NOT EXISTS (lei nº 10
--    das regras de segurança: o IF NOT EXISTS pula o comando INTEIRO,
--    REFERENCES incluído, e o banco fica sem a FK que o arquivo "declara").
--    A FK é o que faz `merge_membros` repontar esta tabela ao fundir duplicata.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mem_censo_convites'::regclass
       and conname  = 'fk_mem_censo_convites_membro'
  ) then
    -- rede de segurança antes de criar a constraint (a FK não é criável com violação)
    update public.mem_censo_convites c
       set membro_id = null
     where c.membro_id is not null
       and not exists (select 1 from public.mem_membros m where m.id = c.membro_id);

    alter table public.mem_censo_convites
      add constraint fk_mem_censo_convites_membro
      foreign key (membro_id) references public.mem_membros(id) on delete set null;
  end if;
end $$;

-- Uma pessoa recebe no máximo 1 convite por canal por rodada.
create unique index if not exists uniq_mem_censo_convites_membro_canal_rodada
  on public.mem_censo_convites (membro_id, canal, rodada)
  where membro_id is not null;

create index if not exists idx_mem_censo_convites_membro
  on public.mem_censo_convites (membro_id);

create index if not exists idx_mem_censo_convites_rodada
  on public.mem_censo_convites (rodada, enviado_em desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.mem_censo_convites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'mem_censo_convites'
       and policyname = 'mem_censo_convites_select'
  ) then
    create policy mem_censo_convites_select on public.mem_censo_convites
      for select to authenticated
      using (public.current_user_module_level('membresia') >= 1);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'mem_censo_convites'
       and policyname = 'mem_censo_convites_service'
  ) then
    create policy mem_censo_convites_service on public.mem_censo_convites
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ⚠️ Sem policy de INSERT/UPDATE/DELETE para `authenticated` de propósito: quem
--    escreve aqui é SEMPRE o backend (service_role), depois de conferir o teto
--    da Meta e o público. Cliente não dispara campanha direto no banco.

-- ── Conferir no CATÁLOGO (o SQL Editor não mostra RAISE NOTICE) ────────────
-- select column_name, data_type from information_schema.columns
--  where table_name = 'mem_censo_convites' order by ordinal_position;
-- select conname from pg_constraint where conrelid = 'public.mem_censo_convites'::regclass;
-- select indexname from pg_indexes where tablename = 'mem_censo_convites';
-- select policyname, cmd from pg_policies where tablename = 'mem_censo_convites';
