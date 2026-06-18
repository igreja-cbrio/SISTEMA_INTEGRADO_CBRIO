-- "Servir em Comunidade" (mandala Cultura · /dashboard) = pessoas distintas que
-- serviram nos últimos 90 dias, unindo DUAS fontes (sem contar a mesma 2x):
--   1. vol_servicos_historico (planilha + Planning Center) · por nome_norm
--   2. vol_check_ins (check-in pelo totem · começou em 17/06) · nome do perfil
--
-- Contexto: o fix 20260618010000 ligou só a vol_check_ins → dava 21 (o totem
-- mal começou). Mas a aba Frequência do módulo mostra 668 (quem serviu em 90d,
-- do histórico). A métrica certa é "quem serviu" = histórico + check-in. Dedup
-- por nome normalizado (lower + unaccent + trim · mesma régua do nome_norm).
-- APLICADA EM PROD em 2026-06-18 via Supabase MCP (retornando 669).
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
  with serviu as (
    select nome_norm as chave
      from public.vol_servicos_historico
     where deleted_at is null
       and data >= _since::date
    union
    select lower(public.unaccent(trim(vp.full_name))) as chave
      from public.vol_check_ins ci
      join public.vol_profiles vp on vp.id = ci.volunteer_id
     where ci.checked_in_at >= _since
       and ci.volunteer_id is not null
  )
  select count(distinct chave)::int
    into result
    from serviu
   where chave is not null and chave <> '';
  return coalesce(result, 0);
end;
$$;

grant execute on function public.kpi_servir_comunidade(timestamptz) to authenticated, service_role, anon;
