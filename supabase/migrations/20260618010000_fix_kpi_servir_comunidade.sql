-- Fix · RPC kpi_servir_comunidade (mandala "Cultura CBRio" · valor Servir)
--
-- Sintoma: no /dashboard a pétala "Servir em Comunidade" mostrava "—".
-- Causa: a RPC kpi_servir_comunidade NÃO existia em prod (drift git↔prod) e a
-- definição original (migration 20260422194732) usava a coluna errada
-- (checkin_at). A coluna real é vol_check_ins.checked_in_at. Sem a RPC,
-- GET /kpis/cultura caía no catch (servirRes.error) e retornava
-- servir_comunidade = null → "—".
--
-- Servir = nº de voluntários DISTINTOS que fizeram check-in nos últimos 90 dias.
-- Idempotente e backwards-compatible (o backend já tolera ausência da função).
-- APLICADA EM PROD em 2026-06-18 via Supabase MCP.
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
  select count(distinct volunteer_id)::int
    into result
    from public.vol_check_ins
   where checked_in_at >= _since
     and volunteer_id is not null;
  return coalesce(result, 0);
end;
$$;

grant execute on function public.kpi_servir_comunidade(timestamptz) to authenticated, service_role, anon;
