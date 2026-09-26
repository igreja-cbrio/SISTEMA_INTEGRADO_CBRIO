-- ════════════════════════════════════════════════════════════════════════════
--  ⚠️⚠️ SEMANA COM DS SOMANDO ZERO É FALHA DE COLETA, NÃO QUEDA DE 100%
--
--  Descoberto no ENSAIO do backfill do ONL-11 (24/09/2026): duas semanas davam
--  −100%. Em 2025-W30 os SEIS cultos tinham `online_ds = 0` — e `online_pico`
--  de 553, 443, 365, 321, 260 e 25, com `online_ddus` chegando a 1.181. Gente
--  assistiu; o DS é que não foi gravado.
--
--  Medido na base desde 2024-01-01:
--    • 17 cultos com `online_ds = 0` E audiência comprovada (pico ou DDUS > 0)
--    • 39 com `online_ds = 0` no total
--    • 758 com `online_ds > 0`
--
--  ⚠️ Uma semana de igreja com literalmente zero visualização DEPOIS da live não
--  acontece. Então `total = 0` é o mesmo sinal que "nenhum culto tem DS": não dá
--  para afirmar nada. A guarda anterior cobria só a ausência (NULL) e deixava o
--  zero explícito passar — a mesma mentira entrando por outra porta.
--
--  ⚠️ Esta migration espelha `backend/utils/crescimentoDs.js`. As duas contas
--  PRECISAM concordar: o card sai do collector JS e a tabela da ficha sai daqui.
--  Divergir faria a ficha contradizer o próprio número que ela explica.
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
             -- ⚠️ NULLIF(...,0): semana somando zero vale SEM DADO, não zero.
             nullif(sum(c.online_ds) FILTER (WHERE c.online_ds IS NOT NULL), 0)::numeric AS total
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
