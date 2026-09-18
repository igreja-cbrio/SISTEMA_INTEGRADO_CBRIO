-- =====================================================================
-- Planejamento Anual · apontamento do Pastor sobre custo/recorrência/data
-- =====================================================================
-- O Pastor, na tela de decisão de uma proposta, pode apontar um valor
-- DIFERENTE do que o proponente informou para custo, recorrência (+ dia da
-- semana quando aplicável) e data de início — sem alterar o que o
-- proponente escreveu (histórico/auditoria). O valor apontado, quando
-- presente, passa a valer no cálculo do orçamento "aprovadas em tempo
-- real" (ver planejamentoAnualRegras.valorEfetivoProposta).
--
-- Idempotente (IF NOT EXISTS) e aditiva — nenhuma coluna existente é
-- tocada. CHECKs de recorrencia_apontada/precisao_inicio_apontada
-- espelham EXATAMENTE o vocabulário das colunas originais
-- (20260812120000: recorrencia IN ('unica','diaria','semanal','mensal',
-- 'trimestral','semestral','personalizada') · precisao_inicio IN
-- ('mes','dia') · dia_semana BETWEEN 0 AND 6).
-- =====================================================================

alter table public.plan_propostas
  add column if not exists custo_apontado numeric,
  add column if not exists recorrencia_apontada text,
  add column if not exists dia_semana_apontado integer,
  add column if not exists data_inicio_apontada date,
  add column if not exists precisao_inicio_apontada text,
  add column if not exists apontamento_pastor_em timestamptz,
  add column if not exists apontamento_pastor_por uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plan_propostas_recorrencia_apontada_check'
  ) then
    alter table public.plan_propostas
      add constraint plan_propostas_recorrencia_apontada_check
      check (recorrencia_apontada is null or recorrencia_apontada in
        ('unica','diaria','semanal','mensal','trimestral','semestral','personalizada'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plan_propostas_precisao_inicio_apontada_check'
  ) then
    alter table public.plan_propostas
      add constraint plan_propostas_precisao_inicio_apontada_check
      check (precisao_inicio_apontada is null or precisao_inicio_apontada in ('mes','dia'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plan_propostas_dia_semana_apontado_check'
  ) then
    alter table public.plan_propostas
      add constraint plan_propostas_dia_semana_apontado_check
      check (dia_semana_apontado is null or dia_semana_apontado between 0 and 6);
  end if;
end $$;

comment on column public.plan_propostas.custo_apontado is
  'Custo apontado pelo Pastor na tela de decisão, substituindo (só para o cálculo de orçamento "aprovadas em tempo real") o custo informado pelo proponente. NULL = usar o valor original.';
comment on column public.plan_propostas.recorrencia_apontada is
  'Recorrência apontada pelo Pastor, mesmo vocabulário da coluna recorrencia. NULL = usar o valor original.';
comment on column public.plan_propostas.dia_semana_apontado is
  'Dia da semana (0=domingo..6=sábado) apontado pelo Pastor, junto de recorrencia_apontada. NULL = usar o valor original.';
comment on column public.plan_propostas.data_inicio_apontada is
  'Data de início apontada pelo Pastor. NULL = usar o valor original (data_inicio).';
comment on column public.plan_propostas.precisao_inicio_apontada is
  'Precisão da data_inicio_apontada, mesmo vocabulário da coluna precisao_inicio (mes|dia). NULL = usar o valor original.';
comment on column public.plan_propostas.apontamento_pastor_em is
  'Quando o Pastor apontou (ou alterou por último) algum dos campos acima.';
comment on column public.plan_propostas.apontamento_pastor_por is
  'Quem (profiles.id) apontou por último algum dos campos acima.';
