-- SERVIR · papéis e escopo por TIME na concessão de supervisão (2026-09-24)
--
-- Pedido do Marcos (23/09): "Nenhuma · Leitor (time | culto | geral) · Líder =
-- editor (time | culto | geral) · Admin (eu e o Matheus)". E "culto" no sentido
-- do DIA — domingo, quarta, sábado (AMI/Bridge) — não do rodízio.
--
-- ⚠️ As 37 concessões vivas continuam valendo byte a byte: `papel` nasce
-- 'lider' (quem tem concessão hoje EDITA) e `team_id` NULL (escopo por área,
-- como sempre foi). Nada de backfill.
--
-- ⚠️ `papel` fica FORA da unique: o mesmo escopo só pode ter UM papel por
-- pessoa — pra virar leitor em líder, edita a linha, não cria outra.
alter table vol_area_supervisores
  add column if not exists papel text not null default 'lider'
    check (papel in ('leitor', 'lider', 'admin')),
  add column if not exists team_id uuid references vol_teams(id) on delete cascade;

comment on column vol_area_supervisores.papel is
  'leitor = abre a Montar escala e só lê · lider = altera (editor) · admin = tudo (só com area=geral sem recorte).';
comment on column vol_area_supervisores.team_id is
  'Escopo por TIME (vol_teams). NULL = escopo por área (legado) ou geral. Com team_id, `area` guarda a área do time só por compatibilidade.';

-- Sábado entra no CHECK do dia (AMI e Bridge são de sábado). A constraint
-- original era inline no ADD COLUMN, então o nome é descoberto pela definição.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'vol_area_supervisores'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%culto_dia%'
  loop
    execute format('alter table vol_area_supervisores drop constraint %I', c.conname);
  end loop;
end $$;
alter table vol_area_supervisores
  add constraint vol_area_supervisores_culto_dia_check
  check (culto_dia is null or culto_dia in ('domingo', 'quarta', 'sabado'));
comment on column vol_area_supervisores.culto_dia is
  'Dia do culto: domingo | quarta | sabado. NULL = qualquer culto.';

-- A unique do escopo passa a incluir o time.
drop index if exists vol_area_supervisores_escopo_uidx;
create unique index if not exists vol_area_supervisores_escopo_uidx
  on vol_area_supervisores (
    membro_id,
    area,
    coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(culto_dia, ''),
    coalesce(culto_periodo, ''),
    coalesce(culto_semana, 0)
  );
create index if not exists vol_area_supervisores_team_idx on vol_area_supervisores (team_id);
