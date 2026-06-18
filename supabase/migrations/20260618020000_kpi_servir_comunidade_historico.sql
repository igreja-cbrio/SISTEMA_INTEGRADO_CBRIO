-- "Servir em Comunidade" (mandala Cultura · /dashboard) passou a refletir quem
-- REALMENTE serviu nos últimos 90 dias, não só quem fez check-in pelo totem.
--
-- Contexto: o fix anterior (20260618010000) ligou a métrica a vol_check_ins →
-- dava 21, porque o check-in pelo totem mal começou a ser usado. Mas a aba
-- Frequência do módulo mostra 668 (pessoas que serviram em 90d, do histórico
-- de serviços). A métrica certa pra "Servir em comunidade · voluntários (90d)"
-- é o histórico de serviços (planilha + Planning Center), não o check-in.
--
-- Fonte: vol_servicos_historico · count distinct nome_norm na janela (mesma
-- régua da aba Frequência). Fallback defensivo pra vol_check_ins se o histórico
-- não existir. APLICADA EM PROD em 2026-06-18 via Supabase MCP.
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
  if to_regclass('public.vol_servicos_historico') is not null then
    select count(distinct nome_norm)::int
      into result
      from public.vol_servicos_historico
     where deleted_at is null
       and data >= _since::date;
    return coalesce(result, 0);
  end if;
  -- Fallback: check-ins do totem
  if to_regclass('public.vol_check_ins') is not null then
    select count(distinct volunteer_id)::int
      into result
      from public.vol_check_ins
     where checked_in_at >= _since
       and volunteer_id is not null;
  end if;
  return coalesce(result, 0);
end;
$$;

grant execute on function public.kpi_servir_comunidade(timestamptz) to authenticated, service_role, anon;
