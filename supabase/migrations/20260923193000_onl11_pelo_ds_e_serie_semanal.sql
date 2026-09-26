-- ════════════════════════════════════════════════════════════════════════════
--  ONL-11 passa a medir o DS · pedido do Matheus (23/09/2026)
--
--  *"esse aqui eu gostaria que fosse o valor do DS. entao quero que use os
--  numeros do DS para medir esse kpi"*. Escolha dele entre três opções: o card
--  guarda o CRESCIMENTO %, e a ficha abre em partes (DS, semana anterior, %).
--
--  ⚠️⚠️ O QUE ELE MEDIA ANTES: `cultos.online_freq` soma `cultos.online_pico` —
--  espectadores SIMULTÂNEOS. O card mostrava "1032" contra uma meta de "30",
--  porque guardava audiência absoluta num indicador cujo nome promete
--  percentual. Medido: W35 1.146 · W36 1.262 · W37 1.400 · W38 1.032.
--
--  ⚠️⚠️ O MOTOR REAL DESTE KPI É O COLLECTOR JS (`fonte_auto`), não o ramo SQL.
--  `calcular_kpi` existe, sabe fazer `delta_pct`, e NÃO É CHAMADO POR NINGUÉM
--  no backend (conferido por grep em 23/09/2026). Por isso a troca é de
--  `fonte_auto`, e `tipo_calculo` segue 'manual' — que é o padrão de 49 KPIs
--  ativos calculados pelo collector.
-- ════════════════════════════════════════════════════════════════════════════
UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'cultos.online_ds_cresc',
       formula_config = jsonb_build_object('dado_tipo', 'frequencia_online_ds',
                                           'comparacao', 'periodo_anterior')
 WHERE id = 'ONL-11';

-- ════════════════════════════════════════════════════════════════════════════
--  A série em partes ganha o ramo SEMANAL do DS.
--
--  ⚠️ Aqui `numerador`/`denominador` NÃO formam uma razão: são o DS da semana e
--  o da semana anterior, e o valor é o CRESCIMENTO entre eles. Os rótulos da
--  ficha vêm do catálogo ("DS da semana" / "semana anterior") justamente para a
--  tabela não sugerir uma divisão que não existe.
--
--  ⚠️⚠️ Semana sem NENHUM culto com DS devolve NULL, nunca −100%. O DS é lido na
--  manhã seguinte ao culto, então a semana em curso passa horas legitimamente
--  vazia. Mesma guarda de `backend/utils/crescimentoDs.js`.
--
--  ⚠️ `sum(online_ds)` devolve BIGINT e a função declara NUMERIC — sem o cast
--  explícito o Postgres recusa em tempo de execução ("structure of query does
--  not match function result type"). O portão (typecheck/testes/build) não
--  alcança isso: só a chamada real reprova.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.kpi_serie_partes(p_kpi_id text, p_n integer DEFAULT 12)
RETURNS TABLE(periodo text, ini date, fim date, numerador numeric, denominador numeric, valor numeric)
LANGUAGE plpgsql STABLE
AS $fn$
DECLARE
  v_area text; v_perio text; v_dado text; v_fonte text; v_hoje date;
BEGIN
  SELECT lower(coalesce(k.area, '')), lower(coalesce(k.periodicidade, 'mensal')),
         coalesce(k.formula_config->>'dado_tipo', ''), coalesce(k.fonte_auto, '')
    INTO v_area, v_perio, v_dado, v_fonte
    FROM public.kpi_indicadores_taticos k
   WHERE k.id = p_kpi_id;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF v_fonte = 'cultos.online_ds_cresc' THEN
    RETURN QUERY
    WITH j AS (
      SELECT (date_trunc('week', v_hoje) - ((g - 1) || ' weeks')::interval)::date AS si
        FROM generate_series(1, p_n) g
    ), w AS (
      SELECT j.si, (j.si + interval '6 days')::date AS sf FROM j
    ), ds AS (
      SELECT w.si, w.sf,
             sum(c.online_ds) FILTER (WHERE c.online_ds IS NOT NULL)::numeric AS total
        FROM w LEFT JOIN public.cultos c ON c.data BETWEEN w.si AND w.sf
       GROUP BY w.si, w.sf
    )
    SELECT to_char(ds.si, 'IYYY-"W"IW'), ds.si, ds.sf,
           ds.total,
           lag(ds.total) OVER (ORDER BY ds.si),
           CASE WHEN lag(ds.total) OVER (ORDER BY ds.si) IS NULL
                  OR lag(ds.total) OVER (ORDER BY ds.si) = 0
                  OR ds.total IS NULL
                THEN NULL
                ELSE round(100.0 * (ds.total - lag(ds.total) OVER (ORDER BY ds.si))
                           / lag(ds.total) OVER (ORDER BY ds.si), 2) END
      FROM ds
     ORDER BY ds.si;
    RETURN;
  END IF;

  IF v_dado IS DISTINCT FROM 'voluntarios_checkin' THEN RETURN; END IF;
  IF v_perio <> 'mensal' THEN RETURN; END IF;

  RETURN QUERY
  WITH j AS (
    SELECT g::date AS mi, (g + interval '1 month' - interval '1 day')::date AS mf
      FROM generate_series(
             date_trunc('month', v_hoje) - ((p_n - 1) || ' months')::interval,
             date_trunc('month', v_hoje),
             interval '1 month') g
  ), e AS (
    SELECT s.id AS sid,
           sv.scheduled_at::date AS dia,
           EXISTS (SELECT 1 FROM public.vol_check_ins ci WHERE ci.schedule_id = s.id) AS tem
      FROM public.vol_schedules s
      JOIN public.vol_services sv ON sv.id = s.service_id
      LEFT JOIN public.vol_teams t ON t.id = s.team_id
     WHERE (v_area = '' OR lower(t.area) = v_area)
  )
  SELECT to_char(j.mi, 'YYYY-MM'), j.mi, j.mf,
         count(DISTINCT e.sid) FILTER (WHERE e.tem)::numeric,
         count(DISTINCT e.sid)::numeric,
         CASE WHEN count(DISTINCT e.sid) = 0 THEN NULL
              ELSE round(100.0 * count(DISTINCT e.sid) FILTER (WHERE e.tem)::numeric
                         / count(DISTINCT e.sid), 2) END
    FROM j
    LEFT JOIN e ON e.dia BETWEEN j.mi AND j.mf
   GROUP BY j.mi, j.mf
   ORDER BY j.mi;
END;
$fn$;

REVOKE ALL ON FUNCTION public.kpi_serie_partes(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kpi_serie_partes(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.kpi_serie_partes(text, integer) FROM authenticated;
