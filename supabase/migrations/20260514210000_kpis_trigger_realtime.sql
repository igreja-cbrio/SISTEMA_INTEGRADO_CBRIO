-- ============================================================================
-- KPIs auto em TEMPO REAL via trigger SQL · elimina dependencia de cron
--
-- Marcos: "se os indicadores sao dados trabalhados, eles devem apenas fazer
--          um select de todas os dados e trabalhar eles, e quando houver uma
--          adicao nesses dados deve ter um trigger que va em todos os
--          indicadores, se nao so teremos indicadores funcionando de 4 em 4
--          horas"
--
-- Mudanca de arquitetura: antes coletores em JS rodavam via cron diario +
-- setImmediate pos PUT. Agora a logica de calculo vive em SQL (PL/pgSQL) e
-- triggers AFTER INSERT/UPDATE/DELETE em cultos e batismo_inscricoes fazem
-- UPSERT em kpi_registros automaticamente. Latencia: zero.
--
-- Cobre 18 KPIs auto-cultos/batismos:
-- - cultos.{ami,bridge,sede}_{freq,conv} (6)
-- - cultos.{online_freq,online_conv,kids_freq} (3)
-- - cultos.amibridge_{freq,conv} (DEPRECATED · 2)
-- - cultos.online_{pico_avg,ds_total,ddus_total} (3)
-- - cultos.conv_visit (1)
-- - batismos.{kids,sede,bridge,ami,online} (5 · usando area_kpi)
--
-- Backfill ao final processa todas as datas existentes · popula kpi_registros
-- de uma so vez (nao precisa esperar cron diario).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper: calcula range [inicio, fim) pra um periodo segundo periodicidade
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_periodo_da_data(p_data date, p_periodicidade text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_periodicidade
    WHEN 'semanal'    THEN to_char(p_data, 'IYYY"-W"IW')
    WHEN 'mensal'     THEN to_char(p_data, 'YYYY-MM')
    WHEN 'trimestral' THEN to_char(p_data, 'YYYY') || '-Q' || to_char(p_data, 'Q')
    WHEN 'semestral'  THEN to_char(p_data, 'YYYY') || '-S' ||
                           CASE WHEN extract(month FROM p_data) <= 6 THEN '1' ELSE '2' END
    WHEN 'anual'      THEN to_char(p_data, 'YYYY')
    ELSE to_char(p_data, 'YYYY-MM')
  END;
$$;

CREATE OR REPLACE FUNCTION public.kpi_periodo_range(p_periodo text, p_periodicidade text)
RETURNS TABLE(inicio date, fim date) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_ano  int;
  v_resto text;
  v_n    int;
BEGIN
  IF p_periodicidade = 'semanal' THEN
    -- ISO week: YYYY-WNN  ·  semana ISO comeca segunda
    v_ano   := substring(p_periodo, 1, 4)::int;
    v_n     := substring(p_periodo, 7)::int;
    -- to_date pra primeira segunda da semana ISO N do ano
    inicio  := to_date(p_periodo, 'IYYY-"W"IW');
    fim     := inicio + INTERVAL '7 days';
  ELSIF p_periodicidade = 'mensal' THEN
    inicio  := to_date(p_periodo, 'YYYY-MM');
    fim     := (inicio + INTERVAL '1 month')::date;
  ELSIF p_periodicidade = 'trimestral' THEN
    v_ano := substring(p_periodo, 1, 4)::int;
    v_n   := substring(p_periodo, 7)::int;
    inicio := make_date(v_ano, (v_n - 1) * 3 + 1, 1);
    fim    := (inicio + INTERVAL '3 months')::date;
  ELSIF p_periodicidade = 'semestral' THEN
    v_ano := substring(p_periodo, 1, 4)::int;
    v_n   := substring(p_periodo, 7)::int;
    inicio := make_date(v_ano, (v_n - 1) * 6 + 1, 1);
    fim    := (inicio + INTERVAL '6 months')::date;
  ELSE  -- anual
    v_ano := p_periodo::int;
    inicio := make_date(v_ano, 1, 1);
    fim    := make_date(v_ano + 1, 1, 1);
  END IF;
  RETURN NEXT;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Calcula o valor de UM KPI auto pra um periodo · CASE por fonte_auto
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_calcular_valor_auto(
  p_fonte text, p_inicio date, p_fim date
) RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE v integer;
BEGIN
  CASE p_fonte
    -- Cultos · AMI
    WHEN 'cultos.ami_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'ami' AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.ami_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'ami' AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Bridge
    WHEN 'cultos.bridge_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'bridge' AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.bridge_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'bridge' AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Sede (Domingos + Quarta com Deus)
    WHEN 'cultos.sede_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE (LOWER(vst.name) LIKE 'domingo%' OR LOWER(vst.name) = 'quarta com deus')
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.sede_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE (LOWER(vst.name) LIKE 'domingo%' OR LOWER(vst.name) = 'quarta com deus')
         AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Kids (frequencia infantil agregada)
    WHEN 'cultos.kids_freq' THEN
      SELECT COALESCE(SUM(c.presencial_kids), 0)::int INTO v
        FROM public.cultos c
       WHERE c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Online (pico online · decisoes online)
    WHEN 'cultos.online_freq' THEN
      SELECT COALESCE(SUM(c.online_pico), 0)::int INTO v
        FROM public.cultos c
       WHERE c.online_pico IS NOT NULL AND c.online_pico > 0
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_online), 0)::int INTO v
        FROM public.cultos c
       WHERE c.decisoes_online IS NOT NULL
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_pico_avg' THEN
      SELECT COALESCE(ROUND(AVG(c.online_pico))::int, 0) INTO v
        FROM public.cultos c
       WHERE c.online_pico IS NOT NULL AND c.online_pico > 0
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_ds_total' THEN
      SELECT COALESCE(SUM(c.online_ds), 0)::int INTO v
        FROM public.cultos c
       WHERE c.online_ds IS NOT NULL AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_ddus_total' THEN
      SELECT COALESCE(SUM(c.online_ddus), 0)::int INTO v
        FROM public.cultos c
       WHERE c.online_ddus IS NOT NULL AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · conversoes globais (uso legado · pos remocao de visitantes)
    WHEN 'cultos.conv_visit' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
       WHERE c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · AMI+Bridge consolidado (DEPRECATED · mantido pra rollback)
    WHEN 'cultos.amibridge_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) IN ('ami', 'bridge') AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.amibridge_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) IN ('ami', 'bridge') AND c.data >= p_inicio AND c.data < p_fim;

    -- Batismos por area (status=realizado · usa data_batismo OU created_at)
    WHEN 'batismos.kids' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'kids'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.sede' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'sede'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.bridge' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'bridge'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.ami' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'ami'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.online' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'online'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;

    ELSE
      v := NULL;
  END CASE;
  RETURN v;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Recalcula KPIs cultos/batismos pra TODAS as periodicidades que cobrem
--    a data informada · UPSERT em kpi_registros (so se origem='auto' ou nova)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_recalcular_para_data(p_data date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  k record;
  v_periodo text;
  v_range   record;
  v_valor   integer;
BEGIN
  IF p_data IS NULL THEN RETURN; END IF;

  FOR k IN
    SELECT id, fonte_auto, periodicidade
      FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND (fonte_auto LIKE 'cultos.%' OR fonte_auto LIKE 'batismos.%')
  LOOP
    v_periodo := kpi_periodo_da_data(p_data, k.periodicidade);
    SELECT inicio, fim INTO v_range FROM kpi_periodo_range(v_periodo, k.periodicidade);
    v_valor   := kpi_calcular_valor_auto(k.fonte_auto, v_range.inicio, v_range.fim);
    IF v_valor IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.kpi_registros
      (indicador_id, periodo_referencia, valor_realizado, origem, responsavel, data_preenchimento, updated_at)
    VALUES
      (k.id, v_periodo, v_valor, 'auto', 'sistema', now(), now())
    ON CONFLICT (indicador_id, periodo_referencia) DO UPDATE
      SET valor_realizado = EXCLUDED.valor_realizado,
          origem          = 'auto',
          data_preenchimento = now(),
          updated_at      = now()
      WHERE kpi_registros.origem IS NULL OR kpi_registros.origem = 'auto';
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Trigger function · roda apos INSERT/UPDATE/DELETE em cultos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_kpi_recalcular_culto()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.data IS NOT NULL THEN
    PERFORM kpi_recalcular_para_data(NEW.data);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.data IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.data <> NEW.data) THEN
    PERFORM kpi_recalcular_para_data(OLD.data);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS cultos_recalc_kpis ON public.cultos;
CREATE TRIGGER cultos_recalc_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.cultos
  FOR EACH ROW EXECUTE FUNCTION public.trg_kpi_recalcular_culto();

-- ----------------------------------------------------------------------------
-- 5. Trigger function · idem pra batismo_inscricoes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_kpi_recalcular_batismo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_data_new date;
  v_data_old date;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_data_new := COALESCE(NEW.data_batismo, NEW.created_at::date);
    PERFORM kpi_recalcular_para_data(v_data_new);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_data_old := COALESCE(OLD.data_batismo, OLD.created_at::date);
    IF TG_OP = 'DELETE' OR v_data_old <> v_data_new THEN
      PERFORM kpi_recalcular_para_data(v_data_old);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS batismos_recalc_kpis ON public.batismo_inscricoes;
CREATE TRIGGER batismos_recalc_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.batismo_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.trg_kpi_recalcular_batismo();

-- ----------------------------------------------------------------------------
-- 6. BACKFILL · processa todas as datas existentes pra popular kpi_registros
--    de uma vez · nao precisa esperar cron diario nem editar manualmente.
-- ----------------------------------------------------------------------------
DO $$
DECLARE d date; v_count int := 0;
BEGIN
  FOR d IN
    SELECT DISTINCT data FROM public.cultos WHERE data IS NOT NULL
    UNION
    SELECT DISTINCT COALESCE(data_batismo, created_at::date)
      FROM public.batismo_inscricoes
     WHERE status = 'realizado'
  LOOP
    PERFORM kpi_recalcular_para_data(d);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfill processou % datas distintas', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (apos rodar a migration):
--
--   -- Quantos registros auto existem agora?
--   SELECT origem, count(*) FROM kpi_registros GROUP BY origem;
--   -- Espera: muitos com origem='auto'
--
--   -- Por indicador
--   SELECT indicador_id, count(*) AS periodos_calc
--     FROM kpi_registros WHERE origem='auto'
--    GROUP BY 1 ORDER BY 1;
--
--   -- Testa trigger: editar um culto qualquer
--   UPDATE cultos SET presencial_adulto = presencial_adulto + 1
--     WHERE id = (SELECT id FROM cultos LIMIT 1);
--   -- Apos · ler kpi_registros do mesmo periodo do culto deve ter atualizado.
-- ============================================================================
