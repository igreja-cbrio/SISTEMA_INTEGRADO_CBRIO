-- Voluntariado · aniversariantes da semana (próximos 7 dias) pra parabenizar.
-- Data de nascimento vem do membro (via membresia_id) ou da inscrição.
-- SECURITY DEFINER (lê mem_membros) · endpoint gateado pelo módulo voluntariado.
-- Já aplicada em prod via MCP em 2026-07-13.
create or replace function public.fn_vol_aniversariantes_semana()
returns table(vol_profile_id uuid, nome text, telefone text, data_nascimento date, aniversario date, dow int)
language sql stable security definer set search_path = public as $$
  with dias as (
    select (current_date + g) as d,
           to_char(current_date + g, 'MM-DD') as mmdd,
           extract(dow from current_date + g)::int as dow
    from generate_series(0, 6) g
  ),
  bdays as (
    select vp.id as vpid,
           coalesce(m.nome, vp.full_name) as nome,
           coalesce(vp.phone, m.telefone, vi.telefone) as tel,
           coalesce(m.data_nascimento, vi.data_nascimento) as dn
    from vol_profiles vp
    left join mem_membros m on m.id = vp.membresia_id and m.deleted_at is null
    left join lateral (
      select data_nascimento, telefone from vol_inscricoes
      where vol_profile_id = vp.id and data_nascimento is not null
      order by created_at desc limit 1
    ) vi on true
  )
  select b.vpid, b.nome, b.tel, b.dn, dias.d, dias.dow
  from bdays b
  join dias on dias.mmdd = to_char(b.dn, 'MM-DD')
  where b.dn is not null
  order by dias.d, b.nome;
$$;
