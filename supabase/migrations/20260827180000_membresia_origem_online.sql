-- ============================================================================
-- Cadastro de membresia ONLINE · origem própria (2026-08-27)
--
-- Pedido do Matheus: "deve ter um cadastro de membresia online também, dentro
-- do módulo do online, e deve ter um link para cadastro de membresia online,
-- pode ser as mesmas perguntas que já temos no formulário de membresia, só que
-- esse vai ser específico para o online."
--
-- ⚠️⚠️ NÃO NASCE UM SEGUNDO FORMULÁRIO. O Contrato de porta proíbe duplicar a
-- porta de PESSOAS — duas fichas divergiriam na primeira mudança de campo, e o
-- funil pós-submit (matcher canônico, contato secundário, CPF tardio, fila de
-- aprovação) teria de ser reconstruído do zero. O que é "do online" aqui é a
-- ORIGEM: o mesmo `/cadastro-membresia`, com `?origem=online`.
--
-- ⚠️ E a origem não é só etiqueta: `mem_cadastros_pendentes` NÃO tem coluna
-- `frequenta_area` (conferido no catálogo em 27/08/2026), então é ela que
-- carrega a declaração "essa pessoa acompanha pelo Online" até a APROVAÇÃO,
-- onde `aprovarCadastroCore` a grava em `mem_membros.frequenta_area` — a mesma
-- coluna que o painel do Online já lê. O CHECK de `mem_membros.frequenta_area`
-- já aceita 'online' (migration anterior); o que faltava era a porta.
--
-- ⚠️⚠️ A LISTA É DERIVADA DA DEFINIÇÃO VIVA, nunca reescrita decorada. Um
-- `DROP + ADD` com lista estática é uma REMOÇÃO silenciosa disfarçada de
-- acréscimo: valor que tenha entrado em produção fora do git sumiria, e o
-- sintoma apareceria meses depois, noutro módulo, como "não consigo cadastrar".
-- É a mesma lei do `app_soft_deletable_tables()` (17/08/2026).
-- ============================================================================

do $$
declare
  v_def     text;
  v_valores text[];
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.mem_cadastros_pendentes'::regclass
     and conname  = 'mem_cadastros_pendentes_origem_check';

  -- Guarda de drift: sem o CHECK conhecido, prefiro ABORTAR a criar do nada uma
  -- constraint com uma lista que eu inventei.
  if v_def is null then
    raise exception 'CHECK mem_cadastros_pendentes_origem_check não existe — a forma viva mudou. Abortando.';
  end if;

  if position('''online''' in v_def) > 0 then
    raise notice '[origem online] já aceita — nada a fazer (%).', v_def;
    return;
  end if;

  select array_agg(distinct m[1] order by m[1]) into v_valores
    from regexp_matches(v_def, '''([^'']+)''::text', 'g') as m;

  if v_valores is null or array_length(v_valores, 1) < 4 then
    raise exception 'não consegui derivar a lista viva de origens a partir de "%" — abortando', v_def;
  end if;

  v_valores := v_valores || 'online'::text;

  execute 'alter table public.mem_cadastros_pendentes drop constraint mem_cadastros_pendentes_origem_check';
  execute format(
    'alter table public.mem_cadastros_pendentes add constraint mem_cadastros_pendentes_origem_check check (origem = any (%L::text[]))',
    v_valores);

  raise notice '[origem online] origens aceitas agora: %', v_valores;
end $$;

comment on column public.mem_cadastros_pendentes.origem is
  'De onde veio a submissão. ⚠️ `online` NÃO é só etiqueta: esta tabela não tem '
  '`frequenta_area`, então é a origem que carrega a declaração até a aprovação, '
  'onde `aprovarCadastroCore` grava `mem_membros.frequenta_area = ''online''` '
  '(só-onde-vazio). Ampliar esta lista é sempre por DERIVAÇÃO da definição viva '
  '(ver 20260827180000).';
