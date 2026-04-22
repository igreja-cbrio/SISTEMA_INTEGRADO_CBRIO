-- RPC tolerante: retorna 0 se a tabela vol_check_ins não existir
create or replace function public.kpi_servir_comunidade(_since timestamptz)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result int := 0;
begin
  if to_regclass('public.vol_check_ins') is null then
    return 0;
  end if;
  execute 'select count(distinct volunteer_id)::int from public.vol_check_ins where checkin_at >= $1'
    into result using _since;
  return coalesce(result, 0);
end;
$$;

grant execute on function public.kpi_servir_comunidade(timestamptz) to authenticated, service_role, anon;

-- Tabela cultura_mensal (idempotente)
create table if not exists public.cultura_mensal (
  mes date primary key,
  qtd_dizimistas int default 0,
  qtd_ofertantes int default 0,
  observacoes text,
  updated_at timestamptz default now(),
  updated_by uuid
);

alter table public.cultura_mensal enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cultura_mensal' and policyname = 'cultura_mensal_read') then
    create policy "cultura_mensal_read" on public.cultura_mensal for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cultura_mensal' and policyname = 'cultura_mensal_write') then
    create policy "cultura_mensal_write" on public.cultura_mensal for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cultura_mensal' and policyname = 'cultura_mensal_update') then
    create policy "cultura_mensal_update" on public.cultura_mensal for update to authenticated using (true);
  end if;
end $$;

-- Tabela pense_videos (idempotente)
create table if not exists public.pense_videos (
  id uuid primary key default gen_random_uuid(),
  video_id text,
  titulo text,
  data_publicacao date,
  views bigint default 0,
  ativo boolean default true,
  created_at timestamptz default now()
);

alter table public.pense_videos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pense_videos' and policyname = 'pense_videos_read') then
    create policy "pense_videos_read" on public.pense_videos for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pense_videos' and policyname = 'pense_videos_write') then
    create policy "pense_videos_write" on public.pense_videos for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pense_videos' and policyname = 'pense_videos_update') then
    create policy "pense_videos_update" on public.pense_videos for update to authenticated using (true);
  end if;
end $$;