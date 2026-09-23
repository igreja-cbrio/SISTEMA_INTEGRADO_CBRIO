-- ════════════════════════════════════════════════════════════════════════════
--  A tabela mês a mês que a ficha do KPI mostra.
--
--  Pedido do Matheus (23/09/2026): ao clicar no card do "% de voluntários que
--  fizeram check-in", ver `mês | escalas | com check-in | %` — o número inteiro,
--  não só o resultado.
--
--  ⚠️⚠️ AS PARTES NÃO EXISTEM GRAVADAS. `kpi_valores_calculados` guarda só o
--  VALOR (`37.70`) — o `detalhes` é `{"tipo":"soma_periodo","valor":...}`, sem
--  numerador nem denominador. Por isso a série é RECALCULADA da fonte, com o
--  mesmo recorte de `_kpi_agregar_dado` (vol_schedules × vol_check_ins por
--  vol_teams.area, crédito no mês do CULTO via vol_services.scheduled_at).
--
--  ⚠️ Uma diferença deliberada contra `_kpi_agregar_dado`: lá a conta é
--  `count(ci.id) / count(s.id)` num LEFT JOIN — uma escala com DOIS check-ins
--  é contada duas vezes dos dois lados, e o percentual pode passar de 100%.
--  Aqui usa-se `count(DISTINCT s.id)`, que é a conta honesta. Medido em
--  23/09/2026: ZERO escalas com check-in duplicado, então hoje os dois dão o
--  mesmo número. Se um dia divergirem, é o KPI que está errado, não a tabela.
--
--  ⚠️ Meses sem escala nenhuma PRECISAM aparecer com 0 — some-los faria a
--  tabela parecer contínua quando há buraco. Daí o LEFT JOIN a partir dos meses.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.kpi_serie_partes(p_kpi_id text, p_n integer DEFAULT 12)
RETURNS TABLE(periodo text, ini date, fim date, numerador numeric, denominador numeric, valor numeric)
LANGUAGE plpgsql STABLE
AS $fn$
DECLARE
  v_area text; v_perio text; v_dado text; v_hoje date;
BEGIN
  SELECT lower(coalesce(k.area, '')), lower(coalesce(k.periodicidade, 'mensal')),
         coalesce(k.formula_config->>'dado_tipo', '')
    INTO v_area, v_perio, v_dado
    FROM public.kpi_indicadores_taticos k
   WHERE k.id = p_kpi_id;

  -- Sem ramo de partes, a ficha cai no histórico gravado (valor sem as partes).
  -- Devolver vazio é honesto; inventar numerador seria pior que não mostrar.
  IF v_dado IS DISTINCT FROM 'voluntarios_checkin' THEN RETURN; END IF;
  IF v_perio <> 'mensal' THEN RETURN; END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

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

REVOKE ALL ON FUNCTION public.kpi_serie_partes(text, integer) FROM PUBLIC, anon, authenticated;
