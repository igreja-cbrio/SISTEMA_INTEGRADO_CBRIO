-- ============================================================================
-- _kpi_periodo_anterior · suporta comparacao='ano_anterior' em semanal
-- ============================================================================
-- Marcos (2026-05-21): "todos os KPIs comparando com mesma semana do ano
-- anterior. Igreja tem eventos/liturgias mensais que fazem variar a
-- frequencia · comparar com a semana anterior nao reflete o ciclo real.
-- Aplicar so nos KPIs semanais por agora".
--
-- Hoje a funcao so suporta `ano_anterior` em periodicidade mensal (linha
-- 208 da migration 20260507280000_fase6c_consolidada). Pra semanal, sempre
-- faz W-1 ignorando o parametro.
--
-- Esta migration estende o branch semanal pra respeitar 'ano_anterior':
--   2026-W20 + ano_anterior → 2025-W20
--   2026-W20 + qualquer outro → 2026-W19 (comportamento legado)
--
-- Edge case W53: ano 2026 tem 53 semanas ISO. 2026-W53 + ano_anterior →
-- 2025 nao tem W53 · retorna NULL (KPI fica sem comparacao).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._kpi_periodo_anterior(p_periodo_referencia text, p_comparacao text)
RETURNS text
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_year int;
  v_month int;
  v_q int;
  v_s int;
  v_w int;
  v_ano_ant int;
  v_max_w_ano_ant int;
BEGIN
  IF p_periodo_referencia ~ '^\d{4}-\d{2}$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_month := substring(p_periodo_referencia, 6, 2)::int;
    IF p_comparacao = 'ano_anterior' THEN
      RETURN (v_year - 1)::text || '-' || lpad(v_month::text, 2, '0');
    ELSE
      v_month := v_month - 1;
      IF v_month = 0 THEN v_month := 12; v_year := v_year - 1; END IF;
      RETURN v_year::text || '-' || lpad(v_month::text, 2, '0');
    END IF;
  ELSIF p_periodo_referencia ~ '^\d{4}-Q\d$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_q    := substring(p_periodo_referencia, 7, 1)::int;
    IF p_comparacao = 'ano_anterior' THEN
      RETURN (v_year - 1)::text || '-Q' || v_q::text;
    END IF;
    v_q := v_q - 1;
    IF v_q = 0 THEN v_q := 4; v_year := v_year - 1; END IF;
    RETURN v_year::text || '-Q' || v_q::text;
  ELSIF p_periodo_referencia ~ '^\d{4}-S\d$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_s := substring(p_periodo_referencia, 7, 1)::int;
    IF p_comparacao = 'ano_anterior' THEN
      RETURN (v_year - 1)::text || '-S' || v_s::text;
    END IF;
    v_s := v_s - 1;
    IF v_s = 0 THEN v_s := 2; v_year := v_year - 1; END IF;
    RETURN v_year::text || '-S' || v_s::text;
  ELSIF p_periodo_referencia ~ '^\d{4}$' THEN
    -- Periodicidade anual · ano_anterior eh equivalente ao default
    RETURN ((p_periodo_referencia::int) - 1)::text;
  ELSIF p_periodo_referencia ~ '^\d{4}-W\d{2}$' THEN
    v_year := substring(p_periodo_referencia, 1, 4)::int;
    v_w := substring(p_periodo_referencia, 7, 2)::int;
    IF p_comparacao = 'ano_anterior' THEN
      v_ano_ant := v_year - 1;
      -- Quantas semanas ISO o ano anterior tem? 52 ou 53.
      -- Calcula via "31 de dezembro do ano anterior em ISO week"
      SELECT EXTRACT(WEEK FROM make_date(v_ano_ant, 12, 28))::int
        INTO v_max_w_ano_ant;
      -- Se W53 atual mas ano anterior tem so 52 → retorna NULL
      IF v_w > v_max_w_ano_ant THEN
        RETURN NULL;
      END IF;
      RETURN v_ano_ant::text || '-W' || lpad(v_w::text, 2, '0');
    END IF;
    -- Comportamento legado · W-1
    v_w := v_w - 1;
    IF v_w = 0 THEN v_w := 52; v_year := v_year - 1; END IF;
    RETURN v_year::text || '-W' || lpad(v_w::text, 2, '0');
  END IF;
  RETURN NULL;
END;
$$;

-- Conferencia rapida:
--   SELECT _kpi_periodo_anterior('2026-W20', 'ano_anterior');  → 2025-W20
--   SELECT _kpi_periodo_anterior('2026-W20', 'semana_anterior');  → 2026-W19
--   SELECT _kpi_periodo_anterior('2026-W53', 'ano_anterior');  → NULL (2025 so tem 52w)
--   SELECT _kpi_periodo_anterior('2026-01', 'ano_anterior');  → 2025-01
-- ============================================================================
