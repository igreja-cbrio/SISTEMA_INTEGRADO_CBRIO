-- ============================================================================
-- KPI · ZERO é DADO · e os KPIs de solicitações entram no recálculo diário
--
-- Pergunta do Matheus (18/08/2026), sobre o relatório semanal de KPI/OKR:
-- "diz que temos 45 KPIs manuais sem lançamento. Esses KPIs não podem ser
-- alimentados de forma automática?"
--
-- Medição antes de tocar (produção, 18/08): dos 168 KPIs ativos, **69 estão sem
-- valor nenhum** e **todos os 69 JÁ passam pelo cálculo automático todo dia**
-- (a última rodada foi hoje 04:00). Não existe KPI esperando alguém digitar.
-- A classificação dos 69, medida linha a linha em `kpi_valores_calculados`:
--
--   15 · fonte `solicitacoes` — nunca recalculadas pelo cron (PARTE 3)
--   17 · razão 0/0            — ninguém registra a demanda
--   18 · dado atual zero      — idem
--    9 · soma com valor ZERO  — tem dado, e a view DESCARTA (PARTE 2)
--    6 · TEM dado atual, mas o período anterior é zero → delta indefinido
--    3 · soma sem dado · 1 outro
--
-- ⚠️⚠️ A causa mais silenciosa é a PARTE 2: `vw_kpi_trajetoria_atual` filtra
-- `valor > 0`, então um KPI que calculou **0** — que é um FATO (nenhum
-- voluntário em treinamento, nenhum encontro no mês) — sai da view e aparece no
-- painel e no relatório como "sem dado / pendente". Zero deixa de ser resposta e
-- passa a parecer omissão.
--
-- ⚠️ E as duas views da casa JÁ DIVERGEM nisso: `vw_kpi_taticos_status` aceita
-- zero (`WHERE c.valor_calculado IS NOT NULL`, sem `> 0`). Ou seja, o `> 0` da
-- trajetória é o desvio, não a regra — esta migration alinha as duas.
-- ============================================================================

-- ── PARTE 1 · rótulo do período CORRENTE ────────────────────────────────────
-- Existe porque a PARTE 2 precisa saber se o período de uma linha já FECHOU.
-- ⚠️ Semanal usa a convenção ISO da própria view (`IYYY-Www`), que difere do
-- `to_char(...,'YYYY') || '-W' || extract(week)` do `calcular_kpi` na virada do
-- ano. NÃO unifiquei aqui: mexer nisso muda o rótulo de período gravado, e este
-- arquivo é sobre LEITURA.
CREATE OR REPLACE FUNCTION public._kpi_periodo_corrente(p_periodicidade text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(coalesce(p_periodicidade, 'mensal'))
    WHEN 'semanal'    THEN to_char(current_date, 'IYYY"-W"IW')
    WHEN 'mensal'     THEN to_char(current_date, 'YYYY-MM')
    WHEN 'trimestral' THEN to_char(current_date, 'YYYY') || '-Q' || (((extract(month from current_date)::int - 1) / 3) + 1)::text
    WHEN 'semestral'  THEN to_char(current_date, 'YYYY') || '-S' || (CASE WHEN extract(month from current_date) <= 6 THEN 1 ELSE 2 END)::text
    WHEN 'anual'      THEN to_char(current_date, 'YYYY')
    ELSE to_char(current_date, 'YYYY-MM')
  END
$$;

COMMENT ON FUNCTION public._kpi_periodo_corrente(text) IS
  'Rotulo do periodo corrente por periodicidade. Usado por vw_kpi_trajetoria_atual para decidir se um periodo JA FECHOU (periodo fechado aceita valor zero como dado).';

-- ── PARTE 2 · zero conta, desde que o período já tenha FECHADO ──────────────
-- PATCH DINÂMICO sobre a definição VIVA (`pg_get_viewdef`), não sobre um texto
-- colado deste arquivo: a view foi alterada em produção mais de uma vez e colar
-- uma versão do repo reverteria aquilo em silêncio.
--
-- ⚠️ Por que "período fechado" e não "zero sempre": aceitar zero no período
-- CORRENTE faria todo KPI mensal aparecer 0 e vermelho no dia 1º, antes de a
-- operação acontecer — trocaria um buraco por um alarme falso, que é pior. Em
-- período fechado, zero é fato consumado e tem que aparecer.
-- ⚠️ O ramo de `semanal` fica INTOCADO (ele já exige período fechado).
DO $$
DECLARE
  v_def text;
  v_novo text;
  v_ocorr_manual int;
  v_ocorr_calc int;
BEGIN
  v_def := pg_get_viewdef('public.vw_kpi_trajetoria_atual'::regclass, true);

  IF v_def LIKE '%_kpi_periodo_corrente%' THEN
    RAISE NOTICE 'vw_kpi_trajetoria_atual ja aceita zero em periodo fechado - nada a fazer';
    RETURN;
  END IF;

  SELECT count(*) INTO v_ocorr_manual FROM regexp_matches(v_def, 'ELSE r\.valor_realizado > 0::numeric', 'g');
  SELECT count(*) INTO v_ocorr_calc   FROM regexp_matches(v_def, 'ELSE c\.valor_calculado > 0::numeric', 'g');

  IF v_ocorr_manual <> 1 OR v_ocorr_calc <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: a forma viva da view divergiu (ancora manual=%, calculado=%). Reler pg_get_viewdef antes de aplicar.',
      v_ocorr_manual, v_ocorr_calc;
  END IF;

  v_novo := replace(
    v_def,
    'ELSE r.valor_realizado > 0::numeric',
    'ELSE (r.periodo_referencia < public._kpi_periodo_corrente(ktm.periodicidade) OR r.valor_realizado > 0::numeric)'
  );
  v_novo := replace(
    v_novo,
    'ELSE c.valor_calculado > 0::numeric',
    'ELSE (c.periodo_referencia < public._kpi_periodo_corrente(ktc.periodicidade) OR c.valor_calculado > 0::numeric)'
  );

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_kpi_trajetoria_atual AS ' || v_novo;
  RAISE NOTICE 'vw_kpi_trajetoria_atual: zero passou a contar em periodo fechado';
END $$;

-- ── PARTE 3 · o recálculo diário passa a cobrir a fonte `solicitacoes` ──────
-- ⚠️ Os 22 KPIs de SLA/NPS interno por área têm `formula_config.fonte =
-- 'solicitacoes'` e **não passam pelo `calcular_kpi`** (que exige
-- numerador/denominador e devolve 'formula_config incompleto'). Quem sabe
-- calculá-los é `recalcular_kpi_adm`, e até agora o ÚNICO chamador dela era o
-- trigger da tabela `solicitacoes` — ou seja, o KPI só era recalculado quando
-- alguém mexia numa solicitação daquela área. Efeito medido: 15 dos 22 nunca
-- fecharam período, e os que fecharam ficaram com o número do dia em que
-- alguém por acaso tocou o registro.
--
-- ⚠️ Aqui a fonte é recalculada no período FECHADO **e** no CORRENTE: sem o
-- corrente, o mês em curso só ganharia valor por movimento na tabela — que é
-- exatamente a dependência que este conserto remove.
CREATE OR REPLACE FUNCTION public.kpi_recalcular_todos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
  DECLARE
    r RECORD;
    v_ok int := 0;
    v_erro int := 0;
    v_adm int := 0;
    v_periodo text;
    v_corrente text;
  BEGIN
    FOR r IN
      SELECT id, periodicidade, formula_config FROM public.kpi_indicadores_taticos
       WHERE ativo = true AND COALESCE(tipo_calculo, 'manual') <> 'manual'
    LOOP
      v_periodo := CASE r.periodicidade
        WHEN 'mensal'     THEN to_char(current_date - interval '1 month', 'YYYY-MM')
        WHEN 'trimestral' THEN to_char(current_date - interval '3 months', 'YYYY')
                               || '-Q' || ((extract(month from current_date - interval '3 months')::int - 1) / 3 + 1)::text
        WHEN 'semestral'  THEN to_char(current_date - interval '6 months', 'YYYY')
                               || '-S' || (CASE WHEN extract(month from current_date - interval '6 months') <= 6 THEN 1 ELSE 2 END)::text
        WHEN 'anual'      THEN to_char(current_date - interval '1 year', 'YYYY')
        WHEN 'semanal'    THEN to_char(current_date - 7, 'YYYY')
                               || '-W' || lpad(extract(week from current_date - 7)::text, 2, '0')
        ELSE to_char(current_date - interval '1 month', 'YYYY-MM')
      END;
      BEGIN
        IF r.formula_config IS NOT NULL AND r.formula_config->>'fonte' = 'solicitacoes' THEN
          v_corrente := public._kpi_periodo_corrente(r.periodicidade);
          PERFORM public.recalcular_kpi_adm(r.id, v_periodo);
          IF v_corrente IS DISTINCT FROM v_periodo THEN
            PERFORM public.recalcular_kpi_adm(r.id, v_corrente);
          END IF;
          v_adm := v_adm + 1;
        ELSE
          PERFORM public.recalcular_kpi(r.id, v_periodo);
        END IF;
        v_ok := v_ok + 1;
      EXCEPTION WHEN OTHERS THEN
        v_erro := v_erro + 1;
      END;
    END LOOP;
    RETURN jsonb_build_object('recalculados', v_ok, 'erros', v_erro,
                              'fonte_solicitacoes', v_adm, 'modo', 'periodo_fechado_anterior+corrente_adm');
  END $function$;

COMMENT ON FUNCTION public.kpi_recalcular_todos() IS
  'Recalculo diario (cron /api/kpis/v2/cron/coletar). KPI com formula_config.fonte=solicitacoes vai para recalcular_kpi_adm (periodo fechado + corrente); o resto segue em recalcular_kpi. NAO trocar o roteamento: calcular_kpi nao sabe ler a fonte solicitacoes e devolve "formula_config incompleto".';

-- ── PARTE 4 · backfill dos 22 KPIs de solicitações (efeito imediato) ────────
DO $$
DECLARE
  r RECORD;
  v_ant text;
  v_cor text;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT id, periodicidade FROM public.kpi_indicadores_taticos
     WHERE ativo = true AND formula_config->>'fonte' = 'solicitacoes'
  LOOP
    v_cor := public._kpi_periodo_corrente(r.periodicidade);
    v_ant := CASE r.periodicidade
      WHEN 'mensal'     THEN to_char(current_date - interval '1 month', 'YYYY-MM')
      WHEN 'trimestral' THEN to_char(current_date - interval '3 months', 'YYYY')
                             || '-Q' || ((extract(month from current_date - interval '3 months')::int - 1) / 3 + 1)::text
      WHEN 'semestral'  THEN to_char(current_date - interval '6 months', 'YYYY')
                             || '-S' || (CASE WHEN extract(month from current_date - interval '6 months') <= 6 THEN 1 ELSE 2 END)::text
      WHEN 'anual'      THEN to_char(current_date - interval '1 year', 'YYYY')
      ELSE to_char(current_date - interval '1 month', 'YYYY-MM')
    END;
    BEGIN
      PERFORM public.recalcular_kpi_adm(r.id, v_ant);
      IF v_cor IS DISTINCT FROM v_ant THEN
        PERFORM public.recalcular_kpi_adm(r.id, v_cor);
      END IF;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'backfill falhou no KPI % (%)', r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'backfill de solicitacoes: % KPIs recalculados', v_n;
END $$;
