-- ============================================================================
-- Backfill · tempo TOTAL histórico dos cultos de domingo (jan–jun/2026)
--
-- A Produção (Pedro Fernandes) levantou o tempo dos cultos passados. Esses
-- cultos eram medidos só como TEMPO TOTAL — a contagem por MOMENTO de culto
-- passa a valer daqui pra frente. Então gravamos a duração total em
-- culto_producao (duracao_segundos + duracao_minutos) SEM criar etapas, pra
-- NÃO inflar os relatórios por momento (Acumulado/Detalhado por etapa, etapas
-- especiais, aderência ao roteiro) — esses ficam corretamente vazios pros
-- cultos antigos, porque não houve medição por momento.
--
-- O que isso alimenta (automático): o KPI PROD-CULTO-PONTUAL
-- (producao.pontualidade_pct · % de cultos dentro da meta de 60 min) e a
-- duração média da aba Acumulado da Produção. O trigger
-- culto_producao_recalc_kpis recalcula o KPI sozinho no INSERT.
--
-- IDEMPOTENTE: ON CONFLICT (culto_id) DO NOTHING — NÃO sobrescreve cultos que
-- já têm linha de Produção (ex.: 07/06 e 14/06, já lançados por momento). Roda
-- de novo sem efeito. Casa cada (data × horário) à linha real de `cultos` pelo
-- service_type de domingo (recurrence_time). Cultos inexistentes são ignorados.
-- ============================================================================
DO $$
DECLARE
  v_ins int;
  v_match int;
BEGIN
  WITH dados(d, hora, seg) AS (
    VALUES
      ('2026-01-04'::date, '08:30:00'::time, 3575),
      ('2026-01-04'::date, '10:00:00'::time, 3890),
      ('2026-01-04'::date, '11:30:00'::time, 3936),
      ('2026-01-04'::date, '19:00:00'::time, 4111),
      ('2026-01-11'::date, '10:00:00'::time, 3859),
      ('2026-01-11'::date, '11:30:00'::time, 3955),
      ('2026-01-11'::date, '19:00:00'::time, 3852),
      ('2026-01-18'::date, '08:30:00'::time, 3974),
      ('2026-01-18'::date, '10:00:00'::time, 3737),
      ('2026-01-18'::date, '11:30:00'::time, 3974),
      ('2026-01-18'::date, '19:00:00'::time, 4050),
      ('2026-01-25'::date, '08:30:00'::time, 4120),
      ('2026-01-25'::date, '10:00:00'::time, 4248),
      ('2026-01-25'::date, '11:30:00'::time, 4121),
      ('2026-01-25'::date, '19:00:00'::time, 4413),
      ('2026-02-01'::date, '08:30:00'::time, 4148),
      ('2026-02-01'::date, '10:00:00'::time, 3915),
      ('2026-02-01'::date, '11:30:00'::time, 4096),
      ('2026-02-01'::date, '19:00:00'::time, 4213),
      ('2026-02-08'::date, '08:30:00'::time, 4038),
      ('2026-02-08'::date, '10:00:00'::time, 4239),
      ('2026-02-08'::date, '11:30:00'::time, 4201),
      ('2026-02-08'::date, '19:00:00'::time, 4086),
      ('2026-02-15'::date, '08:30:00'::time, 3891),
      ('2026-02-15'::date, '10:00:00'::time, 3588),
      ('2026-02-15'::date, '11:30:00'::time, 3892),
      ('2026-02-15'::date, '19:00:00'::time, 3846),
      ('2026-02-22'::date, '08:30:00'::time, 3730),
      ('2026-02-22'::date, '10:00:00'::time, 3843),
      ('2026-02-22'::date, '11:30:00'::time, 4067),
      ('2026-02-22'::date, '19:00:00'::time, 4205),
      ('2026-03-01'::date, '08:30:00'::time, 3761),
      ('2026-03-01'::date, '10:00:00'::time, 3974),
      ('2026-03-01'::date, '11:30:00'::time, 4368),
      ('2026-03-01'::date, '19:00:00'::time, 4390),
      ('2026-03-08'::date, '08:30:00'::time, 4225),
      ('2026-03-08'::date, '10:00:00'::time, 3976),
      ('2026-03-08'::date, '11:30:00'::time, 4032),
      ('2026-03-08'::date, '19:00:00'::time, 4055),
      ('2026-03-15'::date, '08:30:00'::time, 3960),
      ('2026-03-15'::date, '10:00:00'::time, 4173),
      ('2026-03-15'::date, '11:30:00'::time, 4525),
      ('2026-03-15'::date, '19:00:00'::time, 4066),
      ('2026-03-22'::date, '08:30:00'::time, 4062),
      ('2026-03-22'::date, '10:00:00'::time, 4036),
      ('2026-03-22'::date, '11:30:00'::time, 3978),
      ('2026-03-22'::date, '19:00:00'::time, 4224),
      ('2026-03-29'::date, '08:30:00'::time, 3831),
      ('2026-03-29'::date, '10:00:00'::time, 3949),
      ('2026-03-29'::date, '11:30:00'::time, 4371),
      ('2026-03-29'::date, '19:00:00'::time, 3549),
      ('2026-04-05'::date, '08:30:00'::time, 3757),
      ('2026-04-05'::date, '10:00:00'::time, 3795),
      ('2026-04-05'::date, '11:30:00'::time, 4316),
      ('2026-04-05'::date, '19:00:00'::time, 4304),
      ('2026-04-12'::date, '08:30:00'::time, 3771),
      ('2026-04-12'::date, '10:00:00'::time, 3726),
      ('2026-04-12'::date, '11:30:00'::time, 3729),
      ('2026-04-12'::date, '19:00:00'::time, 3834),
      ('2026-04-19'::date, '08:30:00'::time, 4471),
      ('2026-04-19'::date, '10:00:00'::time, 4125),
      ('2026-04-19'::date, '11:30:00'::time, 4670),
      ('2026-04-19'::date, '19:00:00'::time, 4807),
      ('2026-04-26'::date, '08:30:00'::time, 3900),
      ('2026-04-26'::date, '10:00:00'::time, 4105),
      ('2026-04-26'::date, '11:30:00'::time, 3957),
      ('2026-04-26'::date, '19:00:00'::time, 4163),
      ('2026-05-03'::date, '08:30:00'::time, 3775),
      ('2026-05-03'::date, '10:00:00'::time, 3993),
      ('2026-05-03'::date, '11:30:00'::time, 3976),
      ('2026-05-03'::date, '19:00:00'::time, 4282),
      ('2026-05-10'::date, '08:30:00'::time, 4014),
      ('2026-05-10'::date, '10:00:00'::time, 3902),
      ('2026-05-10'::date, '11:30:00'::time, 4158),
      ('2026-05-10'::date, '19:00:00'::time, 3955),
      ('2026-05-17'::date, '08:30:00'::time, 3824),
      ('2026-05-17'::date, '10:00:00'::time, 3843),
      ('2026-05-17'::date, '11:30:00'::time, 3797),
      ('2026-05-17'::date, '19:00:00'::time, 3978),
      ('2026-05-24'::date, '08:30:00'::time, 3967),
      ('2026-05-24'::date, '10:00:00'::time, 4059),
      ('2026-05-24'::date, '11:30:00'::time, 4360),
      ('2026-05-24'::date, '19:00:00'::time, 4320),
      ('2026-05-31'::date, '08:30:00'::time, 3942),
      ('2026-05-31'::date, '10:00:00'::time, 3884),
      ('2026-05-31'::date, '11:30:00'::time, 4070),
      ('2026-05-31'::date, '19:00:00'::time, 4309),
      ('2026-06-07'::date, '08:30:00'::time, 3680),
      ('2026-06-07'::date, '10:00:00'::time, 3562),
      ('2026-06-07'::date, '11:30:00'::time, 3935),
      ('2026-06-07'::date, '19:00:00'::time, 3710),
      ('2026-06-14'::date, '08:30:00'::time, 4051),
      ('2026-06-14'::date, '10:00:00'::time, 3823),
      ('2026-06-14'::date, '11:30:00'::time, 3902),
      ('2026-06-14'::date, '19:00:00'::time, 3937)
  ),
  alvo AS (
    SELECT c.id AS culto_id, dd.seg
      FROM dados dd
      JOIN public.vol_service_types vst
        ON vst.recurrence_time = dd.hora
       AND vst.recurrence_day = 0           -- domingo
      JOIN public.cultos c
        ON c.service_type_id = vst.id
       AND c.data = dd.d
       AND c.deleted_at IS NULL
  ),
  ins AS (
    INSERT INTO public.culto_producao
      (culto_id, duracao_segundos, duracao_minutos, observacoes, preenchido_em)
    SELECT a.culto_id, a.seg, ROUND(a.seg / 60.0)::int,
           'Histórico jan–jun/2026 · tempo total medido pela Produção (sem detalhamento por momento — momentos passam a valer daqui pra frente)',
           now()
      FROM alvo a
    ON CONFLICT (culto_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM alvo), (SELECT count(*) FROM ins)
    INTO v_match, v_ins;
  RAISE NOTICE 'backfill tempo de culto: % cultos casados, % preenchidos (resto ja tinha dado de Producao)', v_match, v_ins;
END $$;

-- Recalcula PROD-CULTO-PONTUAL para os meses afetados (jan–jun/2026).
-- O trigger ja recalcula no INSERT; isto e uma garantia idempotente.
SELECT public.kpi_recalcular_para_data(gs::date)
  FROM generate_series('2026-01-01'::date, '2026-06-01'::date, '1 month') gs;
