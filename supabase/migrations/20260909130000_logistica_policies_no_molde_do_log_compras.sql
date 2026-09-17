-- ============================================================================
-- RHP-04 · Logística · 7 tabelas com policy `USING (true)` para qualquer logado
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ
--   Reescreve as policies de RLS de 7 tabelas da Logística no molde que a
--   tabela irmã `log_compras` já usa.
--
-- O QUE MUDA EM PRODUÇÃO
--   Só a definição das policies. Nenhuma LINHA de nenhuma tabela é alterada.
--
-- ⚠️ O QUE NÃO VOLTA
--   O PASSO 2 apaga TODA policy existente das 7 tabelas, de forma
--   irreversível — inclusive qualquer uma feita à mão fora do git, que é a
--   premissa declarada deste arquivo. **O PASSO 0.a é a única cópia disso.**
--   Rode o 0.a sozinho e salve a saída antes de qualquer outra coisa.
--
-- COMO RODAR
--   1. PASSO 0.a  — sozinho. Salve a saída num arquivo.
--   2. PASSO 0.b  — sozinho. Salve a saída.
--   3. PASSOS 1 a 3 — TUDO NUMA COLAGEM SÓ. O `set local lock_timeout` só
--      vale dentro da transação que o SQL Editor abre em volta da colagem;
--      rodando bloco a bloco ele emite um WARNING e não pega.
--   ⚠️ Não use `begin;`/`commit;` — o SQL Editor já abre a transação.
--
-- RISCO: baixo, com uma ressalva que não é pequena.
--   Baixo porque ninguém lê essas tabelas por PostgREST (medido em 09/09/2026:
--   as 7 devolvem `403 · 42501`), nenhuma tela do front web nem do app faz
--   `from('log_...')`, e todas as rotas de logística usam `service_role`, que
--   passa por cima de RLS. A ressalva é o parágrafo "o que não volta" acima.
--
-- ============================================================================
-- POR QUE ESTE ARQUIVO EXISTE, SE A PORTA JÁ ESTÁ FECHADA
-- ============================================================================
-- O achado RHP-04 dizia que qualquer um dos 205 usuários logados podia APAGAR
-- as 160 notas fiscais direto pelo PostgREST. Era verdade quando foi medido,
-- em 06/09/2026.
--
-- Re-medido em 09/09/2026 com a conta comum de teste, papel `authenticated`:
-- as 7 tabelas devolvem `403 · 42501 permission denied`. O arquivo
-- `20260906115900_URGENTE_revoke_authenticated.sql` — rodado à mão no SQL
-- Editor em 06/09/2026, ainda não mergeado, guardado em
-- `Downloads/varredura-correcao/` — tirou o GRANT de tabela do papel
-- `authenticated`, e sem GRANT a policy nem chega a ser avaliada.
--
-- Mas a policy continua escrita `USING (true)`. Ela é a SEGUNDA barreira, e
-- ela diz "pode todo mundo". No dia em que o GRANT voltar (migration nova,
-- clique no painel, restore, ambiente novo), as 7 abrem inteiras no mesmo
-- segundo. É esse buraco que este arquivo tapa.
--
-- MOLDE: `log_compras`, migration 20260618160000, mesmo módulo.
--   SELECT nível >= 1 · INSERT/UPDATE >= 2 · DELETE só super-admin.
--   Nota fiscal apagada não volta — por isso o DELETE é super-admin.
--
-- CONFERIDO em 09/09/2026, antes de escolher os níveis: logística tem 2 cargos
-- em nível 5, 4 em nível 4 e 7 em nível 1, e ninguém em 2 nem em 3. O cargo
-- "Membro" NÃO tem linha no módulo, então o `>= 1` da leitura não alcança a
-- base inteira — que é o erro que já aconteceu nesta série. E o `>= 2` da
-- escrita não fica acima do teto de quem opera, que é o outro erro que já
-- aconteceu (exigimos 5 num módulo cujo teto era 4 e teria dado 403 no time).
--
-- MASSA PROTEGIDA, medida em 09/09/2026: 314 fornecedores e 160 notas fiscais
-- somando R$ 41.911,79. As outras 5 tabelas estão vazias — fecham antes de
-- encherem.
--
-- IDEMPOTENTE: rodado 3 vezes, nesta versão, num PostgreSQL 18.3 descartável
-- em 09/09/2026, com as 28 policies originais de 10/04 mais uma sobra feita à
-- mão. As 3 rodadas terminaram no mesmo estado.
-- ============================================================================


-- ###########################################################################
-- PASSO 0.a · RODE SOZINHO E SALVE A SAÍDA.
-- É a única cópia do que o PASSO 2 vai apagar para sempre.
-- (O SQL Editor mostra só o resultado do ÚLTIMO comando da colagem — por isso
--  esta consulta vai sozinha, e não junto com a 0.b.)
-- ###########################################################################
select tablename, policyname, cmd, roles::text, qual, with_check
from   pg_policies
where  schemaname = 'public'
  and  tablename in ('log_fornecedores', 'log_notas_fiscais', 'log_movimentacoes',
                     'log_pedidos', 'log_pedido_itens', 'log_recebimentos',
                     'log_solicitacoes_compra')
order  by tablename, policyname;


-- ###########################################################################
-- PASSO 0.b · RODE SOZINHO. Estado de RLS e de privilégio, para comparar
-- depois. `revoke`/`grant` não são tocados por este arquivo; isto é só foto.
-- ###########################################################################
select c.relname                                              as tabela,
       c.relrowsecurity                                       as rls_ligada,
       has_table_privilege('anon',          c.oid, 'SELECT')  as anon_le,
       has_table_privilege('authenticated', c.oid, 'SELECT')  as authenticated_le
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where  c.relkind = 'r'
  and  c.relname in ('log_fornecedores', 'log_notas_fiscais', 'log_movimentacoes',
                     'log_pedidos', 'log_pedido_itens', 'log_recebimentos',
                     'log_solicitacoes_compra')
order  by 1;


-- ###########################################################################
-- PASSOS 1 a 3 · VÃO TODOS NUMA COLAGEM SÓ.
-- ###########################################################################

-- Prefere falhar rápido a travar a fila da logística. `SET LOCAL` só vale
-- dentro da transação que o editor abre — é por isso que os três passos vão
-- juntos. Rodando em separado, isto vira um WARNING silencioso.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- PASSO 1 · Confirma os dois ajudantes de RLS, um a um.
-- Se faltar qualquer um, o CREATE POLICY do passo 2 estouraria 42883 no meio
-- do laço — aborta tudo, mas com mensagem críptica. Aqui a mensagem diz qual.
-- Nada foi alterado ainda quando este passo roda: se o GRANT EXECUTE abaixo
-- falhar por falta de dono, repita a colagem como `supabase_admin`.
-- ---------------------------------------------------------------------------
do $$
declare
  falta text := '';
begin
  if to_regprocedure('public.current_user_module_level(text)') is null then
    falta := falta || 'current_user_module_level(text) ';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    falta := falta || 'is_super_admin() ';
  end if;
  if falta <> '' then
    raise exception 'PARE: faltam em public -> %. Nao aplique o PASSO 2.', falta;
  end if;

  grant execute on function public.current_user_module_level(text) to authenticated;
  grant execute on function public.is_super_admin() to authenticated;
  raise notice 'ajudantes de RLS confirmados e executaveis por authenticated';
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 2 · APLICA. Para cada uma das 7 tabelas:
--   liga RLS · apaga TODA policy existente · recria as 5 do molde.
--
-- Apaga TODAS de propósito: policies permissivas se SOMAM, e uma sobra
-- `USING (true)` esquecida anula todo o resto. Foi isso que fez a primeira
-- tentativa da migration de policies desta série (a de 06/09) rodar limpa e
-- não ter efeito nenhum.
--
-- A lista é materializada com `array_agg` ANTES do laço. Iterar o catálogo
-- enquanto se apaga do catálogo é o padrão que produz "pulou uma linha".
-- ---------------------------------------------------------------------------
do $$
declare
  t       text;
  p       text;
  pols    text[];
  n_drop  int := 0;
  n_tab   int := 0;
  alvos   text[] := array[
    'log_fornecedores', 'log_notas_fiscais', 'log_movimentacoes',
    'log_pedidos', 'log_pedido_itens', 'log_recebimentos',
    'log_solicitacoes_compra'
  ];
begin
  foreach t in array alvos loop
    if to_regclass('public.' || t) is null then
      raise notice 'pulei %: a tabela nao existe neste banco', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    select coalesce(array_agg(policyname), '{}')
      into pols
      from pg_policies
     where schemaname = 'public' and tablename = t;

    foreach p in array pols loop
      execute format('drop policy %I on public.%I', p, t);
      n_drop := n_drop + 1;
    end loop;

    -- SELECT · ler exige estar no módulo logística
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (public.current_user_module_level('logistica') >= 1)
    $f$, t || '_select', t);

    -- INSERT · criar exige nível de escrita
    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (public.current_user_module_level('logistica') >= 2)
    $f$, t || '_insert', t);

    -- UPDATE · alterar exige nível de escrita (nas duas pontas)
    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (public.current_user_module_level('logistica') >= 2)
        with check (public.current_user_module_level('logistica') >= 2)
    $f$, t || '_update', t);

    -- DELETE · documento fiscal apagado não volta. Só super-admin.
    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (public.is_super_admin())
    $f$, t || '_delete', t);

    -- service_role · o backend. Explícito, no mesmo molde de log_compras.
    execute format($f$
      create policy %I on public.%I
        for all to service_role using (true) with check (true)
    $f$, t || '_service', t);

    n_tab := n_tab + 1;
  end loop;

  raise notice 'RHP-04: % tabelas no molde do log_compras · % policies antigas removidas · 5 novas por tabela', n_tab, n_drop;
end $$;

-- ---------------------------------------------------------------------------
-- COMENTÁRIOS · vêm ANTES da conferência porque o SQL Editor mostra o
-- resultado do ÚLTIMO comando, e a conferência é a prova. Se o COMMENT fosse
-- o último, a tela diria "Success. No rows returned" e a prova sumiria.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.log_fornecedores') is not null then
    comment on table public.log_fornecedores is
      'Fornecedores da Logistica. RLS no molde de log_compras desde 09/09/2026 (varredura, achado RHP-04): as policies originais de 10/04/2026 eram USING (true) para qualquer logado.';
  end if;
  if to_regclass('public.log_notas_fiscais') is not null then
    comment on table public.log_notas_fiscais is
      'Notas fiscais da Logistica. DELETE restrito a super-admin desde 09/09/2026 (varredura, RHP-04): documento fiscal apagado e perda irrecuperavel, com consequencia contabil.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3 · CONFERÊNCIA. Esperado: 7 linhas, todas com
--   rls_ligada = true · policies_do_molde = 5 · policies_estranhas = 0
--
-- A prova é por LISTA BRANCA: as 5 policies existentes têm que ser exatamente
-- as 5 nomes do molde. É mais forte do que procurar `USING (true)` — uma sobra
-- escrita `using (1=1)` ou `using (auth.role() = 'authenticated')` é tão aberta
-- quanto, e nenhuma busca pelo literal `true` a pegaria.
-- ---------------------------------------------------------------------------
with alvo(tabela) as (
  values ('log_fornecedores'), ('log_notas_fiscais'), ('log_movimentacoes'),
         ('log_pedidos'), ('log_pedido_itens'), ('log_recebimentos'),
         ('log_solicitacoes_compra')
)
select a.tabela,
       c.relrowsecurity as rls_ligada,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = a.tabela
           and p.policyname = any(array[a.tabela || '_select', a.tabela || '_insert',
                                        a.tabela || '_update', a.tabela || '_delete',
                                        a.tabela || '_service'])
       ) as policies_do_molde,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = a.tabela
           and p.policyname <> all(array[a.tabela || '_select', a.tabela || '_insert',
                                         a.tabela || '_update', a.tabela || '_delete',
                                         a.tabela || '_service'])
       ) as policies_estranhas
from   alvo a
join   pg_class c     on c.relname = a.tabela
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order  by 1;
