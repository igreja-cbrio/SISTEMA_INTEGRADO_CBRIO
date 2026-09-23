-- ════════════════════════════════════════════════════════════════════════════
--  ARRECADAÇÃO DO ONLINE · a agregação que alimenta a aba do /online
--
--  Pedido do Matheus (23/09/2026): "quero uma aba para mostrar as analises da
--  arrecadacao do online (...) arrecadacao semanal apenas do online,
--  arrecadacao mensal, variacao de uma semana pra outra, variacao de um mes
--  para o outro (...) comparar com o ano anterior tbm."
--
--  ⚠️⚠️ POR QUE UMA RPC E NÃO LEITURA DIRETA
--  `fin_transacoes` tem 22.618 linhas só nesta conta, e o PostgREST corta em
--  1.000 **em silêncio** — agregar no cliente devolveria ~12% do valor de 2022
--  sem erro nenhum. E a semana financeira é uma função SQL
--  (`fin_semana_qua_ter`), que o JS não alcança sem reimplementar. Espelho de
--  semana em JS é exatamente o que derrubou a unificação de 01/06 (revertida
--  em 08/07 por dar número diferente do fechamento). ⇒ tudo no banco, uma
--  viagem só.
--
--  ⚠️⚠️ AS DUAS SEMANAS DA CASA (lei de 08/07, NÃO reunificar)
--  financeiro = QUARTA→TERÇA (`fin_semana_qua_ter`) · frequência = SEG→DOM.
--  Aqui é DINHEIRO ⇒ quarta→terça, e a medição de 23/09 explica por quê:
--  dos 2.546 créditos de 2026, **53% caem na SEGUNDA e ZERO no fim de semana**
--  — a oferta do culto de domingo é creditada em D+1. Na semana qua→ter o
--  domingo e a segunda ficam JUNTOS; na seg→dom o dinheiro do domingo cai na
--  semana SEGUINTE. (Decisão do Matheus em 23/09, com o número na mão.)
--
--  ⚠️⚠️ O RECORTE, e o que ele EXCLUI (medido em 23/09/2026)
--  "Toda arrecadação que entra no Santander" NÃO é doação online — a mesma
--  conta recebe, desde 2025:
--    · R$ 2.114.763 em "Dinheiro" com classe **transferencia** (entre contas
--      próprias da igreja) — somar isso DOBRA o total e é dupla contagem pura;
--    · R$ 471.291 em **cartão de crédito/débito** = repasse da maquininha do
--      culto PRESENCIAL;
--    · R$ 1.041.067 numa única linha de "Crédito em Conta" — operação de
--      câmbio / doação institucional (Eagle Brook), não arrecadação de culto;
--    · R$ 33,75 em 162 linhas de "Crédito em Conta" = rendimento de aplicação.
--  ⇒ o recorte é **forma ELETRÔNICA** (pix · ted · transferência) com o WHERE
--  canônico de receita das `vw_fin_semana_*`.
--
--  ⚠️ NÃO filtra por LISTA DE PLANOS DE CONTA, de propósito. A planilha do
--  contábil usa 5 planos escritos à mão, e dois deles já têm morte marcada:
--  "Dizimo Domingo 10:00" (o culto das 10:00 foi ENCERRADO no corte de
--  24/08/2026) e "Campanha 2025" (a campanha do Kids abriu em 06/09/2026 e
--  vai nascer com outro nome). Plano fora da lista **sumiria em silêncio** e o
--  número pareceria queda de doação. Aqui plano novo ENTRA por padrão e
--  aparece na composição — é a lei do corte de bairro do censo (16/09): a
--  soma tem que fechar.
--  ⇒ Consequência declarada: o total fica ~8% acima da planilha do contábil
--  (R$ 961.364 × R$ 888.884 em 2026), porque inclui Bazar, Retiro AMI e
--  Outras Contribuições. A composição por plano mostra cada um.
--
--  ⚠️ A conta Santander É o canal online — confirmado pelo Matheus em
--  23/09/2026. Não é derivável do dado: o Itaú recebe 6× mais Pix de dízimo
--  (R$ 5,58 mi × R$ 740 mil em 2026). A premissa fica registrada AQUI porque
--  não existe campo em `fin_contas` que a expresse.
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ A conta em CONSTANTE nomeada, não espalhada pelas queries: trocar de
-- conta (ou passar a ter duas) é um lugar só.
create or replace function public.fn_online_conta_id()
returns uuid language sql immutable as $$
  select '02eb0b02-58ee-4f08-90a6-b8de2268338d'::uuid
$$;

comment on function public.fn_online_conta_id() is
  '[ARRECADAÇÃO ONLINE] Conta Santander Ag 3957 C/C 13000422-2. O Matheus '
  'confirmou em 23/09/2026 que é a conta do canal online (a chave Pix do '
  'culto online aponta para ela; o Itaú é o presencial). NÃO é derivável do '
  'dado — o Itaú recebe 6x mais Pix de dízimo.';

-- ⚠️ Normalização da forma de pagamento. A coluna é TEXT LIVRE, sem CHECK, e
-- os valores reais são 'Pix', 'TED', 'Transferência' (com acento e maiúscula),
-- mais 'Transferencia' sem acento no histórico e 11 linhas NULAS. Um
-- `in ('pix','ted')` cru devolve ZERO — e zero se lê como "a arrecadação caiu".
create or replace function public.fn_online_forma_eletronica(p_forma text)
returns boolean language sql immutable as $$
  select lower(translate(coalesce(p_forma, ''),
                         'ÂÀÃÁÇÉÊÍÓÔÕÚâàãáçéêíóôõú',
                         'AAAACEEIOOOUaaaaceeiooou'))
         in ('pix', 'ted', 'transferencia')
$$;

comment on function public.fn_online_forma_eletronica(text) is
  '[ARRECADAÇÃO ONLINE] Pix/TED/Transferência com acento e caixa normalizados. '
  'fin_transacoes.forma_pagamento é TEXT sem CHECK — comparar cru devolve zero, '
  'e zero se lê como queda de arrecadação.';

-- ════════════════════════════════════════════════════════════════════════════
--  fn_online_arrecadacao(inicio, fim) → jsonb
--
--  Uma viagem ao banco devolve: série semanal (qua→ter), série mensal,
--  composição por plano de contas, concentração de doadores, o que ficou de
--  FORA do recorte, e a data de corte real do dado.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_online_arrecadacao(
  p_inicio date,
  p_fim date
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with parametros as (
  select public.fn_online_conta_id() as conta_id
),
-- Tudo que é receita viva na conta, no período. `elegivel` separa o que entra
-- do que fica na cauda declarada — nada é descartado em silêncio.
bruto as (
  select
    t.valor,
    coalesce(t.data_pagamento, t.data_competencia) as data,
    t.descricao,
    t.classe_movimento,
    coalesce(pc.nome, '(sem plano de contas)') as plano,
    coalesce(t.forma_pagamento, '(forma não informada)') as forma,
    public.fn_online_forma_eletronica(t.forma_pagamento) as eletronica
  from public.fin_transacoes t
  cross join parametros p
  left join public.fin_plano_contas pc on pc.id = t.plano_contas_id
  where t.conta_id = p.conta_id
    and t.tipo = 'receita'
    -- WHERE canônico das vw_fin_semana_* — as 4 condições, não 2:
    and coalesce(t.status, '') <> 'cancelado'
    -- exclui transferência entre contas próprias, empréstimo e estorno
    and t.classe_movimento in ('ordinaria', 'extraordinaria')
    -- ⚠️ anti dupla contagem OFX × balanço (lei registrada em 24/07)
    and (t.lancamento_bruto_id is null or t.codigo_legado is not null)
    and coalesce(t.data_pagamento, t.data_competencia) between p_inicio and p_fim
),
dentro as (
  select * from bruto where eletronica
),
-- ⚠️ O CORTE REAL do dado: a importação do balanço é SEMANAL, então a última
-- semana está SEMPRE parcial. Sem isso, toda segunda-feira a tela anuncia uma
-- queda que é só o import que ainda não chegou.
corte as (
  select max(coalesce(t.data_pagamento, t.data_competencia)) as ultima_data
  from public.fin_transacoes t
  cross join parametros p
  where t.conta_id = p.conta_id and t.tipo = 'receita'
),
semanal as (
  select s.inicio, s.fim, s.label,
         sum(d.valor) as total, count(*) as n
  from dentro d
  cross join lateral public.fin_semana_qua_ter(d.data) s
  group by s.inicio, s.fim, s.label
),
mensal as (
  select to_char(d.data, 'YYYY-MM') as mes,
         sum(d.valor) as total, count(*) as n,
         -- nº de SEGUNDAS no mês: com 53% do valor caindo na segunda, um mês
         -- com 5 segundas tem ~11% a mais que um com 4, SEM nenhuma mudança de
         -- comportamento. Quem compara mês a mês precisa deste número ao lado.
         count(distinct d.data) filter (where extract(isodow from d.data) = 1) as dias_segunda
  from dentro d
  group by 1
),
composicao as (
  select plano, sum(valor) as total, count(*) as n
  from dentro group by 1
),
-- ⚠️ A cauda: o que a conta recebeu e NÃO entrou. Publicada para a soma
-- fechar — esconder faz quem confere o extrato concluir que falta dinheiro.
fora as (
  select forma, sum(valor) as total, count(*) as n
  from bruto where not eletronica group by 1
),
por_doador as (
  -- ⚠️ `membro_id` está preenchido em 35 de 2.555 linhas, então o doador é o
  -- NOME do lançamento. É aproximação declarada, não identidade.
  select coalesce(nullif(btrim(descricao), ''), '(sem nome)') as doador,
         sum(valor) as total
  from dentro group by 1
),
ranking as (
  select total, row_number() over (order by total desc) as pos,
         sum(total) over () as geral, count(*) over () as doadores
  from por_doador
)
select jsonb_build_object(
  'inicio', p_inicio,
  'fim', p_fim,
  'corte', (select ultima_data from corte),
  'total', (select coalesce(sum(valor), 0) from dentro),
  'lancamentos', (select count(*) from dentro),
  -- ⚠️ Mediana, NUNCA só a média: medido em 2026, média R$ 351 contra mediana
  -- R$ 100 — a cauda é longa e a média não descreve doador nenhum.
  'ticket_mediano', (select percentile_cont(0.5) within group (order by valor) from dentro),
  'ticket_medio', (select avg(valor) from dentro),
  'semanas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'inicio', inicio, 'fim', fim, 'label', label,
      'total', total, 'n', n) order by inicio)
    from semanal), '[]'::jsonb),
  'meses', coalesce((
    select jsonb_agg(jsonb_build_object(
      'mes', mes, 'total', total, 'n', n, 'dias_segunda', dias_segunda) order by mes)
    from mensal), '[]'::jsonb),
  'composicao', coalesce((
    select jsonb_agg(jsonb_build_object('plano', plano, 'total', total, 'n', n)
                     order by total desc)
    from composicao), '[]'::jsonb),
  'fora_do_recorte', coalesce((
    select jsonb_agg(jsonb_build_object('forma', forma, 'total', total, 'n', n)
                     order by total desc)
    from fora), '[]'::jsonb),
  'concentracao', jsonb_build_object(
    'doadores', (select max(doadores) from ranking),
    'top10_pct', (select round(sum(total) / nullif(max(geral), 0) * 100, 1) from ranking where pos <= 10),
    'top50_pct', (select round(sum(total) / nullif(max(geral), 0) * 100, 1) from ranking where pos <= 50)
  )
)
$$;

comment on function public.fn_online_arrecadacao(date, date) is
  '[ARRECADAÇÃO ONLINE] Série semanal (QUA→TER, fin_semana_qua_ter), mensal, '
  'composição, concentração e a cauda do que ficou fora, numa viagem só. '
  'Agregação no banco porque o PostgREST corta em 1000 linhas em silêncio e a '
  'semana financeira é função SQL. Recorte: conta do online + receita viva '
  '(status<>cancelado, classe ordinaria/extraordinaria, anti dupla contagem '
  'OFX) + forma eletrônica. NÃO filtra plano de contas de propósito — plano '
  'novo entra e aparece na composição, em vez de sumir em silêncio.';

-- ⚠️ Sem GRANT para anon/authenticated (lei de 10/08): quem chama é o backend
-- com service_role, atrás do guard financeiro. Esta função devolve valores em
-- reais, e o módulo `online` é alcançável por 31 cargos — inclusive "Membro" e
-- "Voluntário".
revoke all on function public.fn_online_arrecadacao(date, date) from public, anon, authenticated;
revoke all on function public.fn_online_conta_id() from public, anon, authenticated;
revoke all on function public.fn_online_forma_eletronica(text) from public, anon, authenticated;
grant execute on function public.fn_online_arrecadacao(date, date) to service_role;
grant execute on function public.fn_online_conta_id() to service_role;
grant execute on function public.fn_online_forma_eletronica(text) to service_role;

-- ── Conferência (não altera nada) ───────────────────────────────────────────
do $$
declare
  v jsonb;
  v_total numeric;
  v_semanas int;
begin
  select public.fn_online_arrecadacao('2026-01-01', '2026-09-23') into v;
  v_total := (v->>'total')::numeric;
  v_semanas := jsonb_array_length(v->'semanas');

  if v_total is null or v_total <= 0 then
    raise exception 'ABORT: fn_online_arrecadacao devolveu total vazio (%)', v_total;
  end if;
  if v_semanas < 30 then
    raise exception 'ABORT: esperava ~38 semanas em 2026, vieram %', v_semanas;
  end if;

  raise notice 'OK · 2026 ate 23/09: R$ % em % lancamentos, % semanas, corte %',
    round(v_total, 2), v->>'lancamentos', v_semanas, v->>'corte';
end $$;
