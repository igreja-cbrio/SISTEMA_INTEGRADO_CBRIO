-- Modo ensaio do totem Kids sem sujar dado real (design v5 · Marcos 2026-07-21/22).
-- Par do deploy claude/kids-checkin-v5-selector: o sweep lazy e o Encerrar
-- passam a soft-deletar (deleted_at) check-ins de ensaio ANTES de consolidar.
-- Idempotente e backwards-compatible (CREATE OR REPLACE · nenhum schema novo).
--
-- 1) Consolidação do culto IGNORA check-ins soft-deletados. Sem isto a limpeza
--    automática de ensaio seria inócua no KPI (o trigger contava linha apagada ·
--    verificado em 20260707220000). Estritamente mais correto em geral: linha
--    apagada não conta em lugar nenhum (o cron resumo-kids e o radar já filtram).
CREATE OR REPLACE FUNCTION public.fn_kids_sessao_consolida_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
  v_decisoes int;
BEGIN
  IF NEW.status = 'encerrada'
     AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'encerrada') THEN

    SELECT COUNT(DISTINCT crianca_id),
           COUNT(DISTINCT crianca_id) FILTER (WHERE fez_decisao_jesus = true)
      INTO v_total, v_decisoes
      FROM public.kids_checkins
      WHERE sessao_id = NEW.id
        AND deleted_at IS NULL;

    UPDATE public.cultos
      SET presencial_kids = v_total,
          decisoes_kids   = v_decisoes,
          updated_at      = now()
      WHERE id = NEW.culto_id;
  END IF;
  RETURN NEW;
END $$;

-- 2) Radar de ausentes nunca considera culto de dia FUTURO no calendário —
--    check-in de ensaio (na janela entre o teste e a limpeza automática) não
--    pode inflar os "cultos perdidos" das outras crianças.
CREATE OR REPLACE FUNCTION public.fn_kids_ausentes_consecutivos(p_min int DEFAULT 3)
RETURNS TABLE(crianca_id uuid, nome text, ultima_presenca date, cultos_perdidos int)
LANGUAGE sql STABLE AS $$
  WITH pres AS (
    -- 1 linha por criança × data de culto em que ela teve check-in no totem
    SELECT DISTINCT ck.crianca_id, cu.data
    FROM public.kids_checkins ck
    JOIN public.kids_sessoes s ON s.id = ck.sessao_id
    JOIN public.cultos cu ON cu.id = s.culto_id
    WHERE ck.deleted_at IS NULL
      AND cu.data <= CURRENT_DATE
  ),
  cal AS (
    -- calendário = dias em que HOUVE check-in de Kids (qualquer criança)
    SELECT DISTINCT data FROM pres
  ),
  ult AS (
    SELECT p.crianca_id, max(p.data) AS ultima_data
    FROM pres p
    GROUP BY p.crianca_id
  )
  SELECT
    k.id, k.nome, ult.ultima_data,
    (SELECT count(*) FROM cal WHERE cal.data > ult.ultima_data)::int AS cultos_perdidos
  FROM public.kids_criancas k
  JOIN ult ON ult.crianca_id = k.id
  WHERE k.ativo = true
    AND k.deleted_at IS NULL
    AND COALESCE(k.visitante, false) = false
    AND ult.ultima_data >= (CURRENT_DATE - INTERVAL '90 days')
    AND (SELECT count(*) FROM cal WHERE cal.data > ult.ultima_data) >= p_min;
$$;

-- (COMMENT numa linha só · o editor do Supabase engasga com quebra entre IS e a string)
COMMENT ON FUNCTION public.fn_kids_sessao_consolida_culto() IS 'Consolida presencial_kids/decisoes_kids do culto ao encerrar a sessao, ignorando check-ins soft-deletados (ensaio · 2026-07-22).';
COMMENT ON FUNCTION public.fn_kids_ausentes_consecutivos(int) IS 'Radar de ausentes do Kids: presenca = check-ins do totem (kids_checkins), ignora deletados e cultos de dia futuro (2026-07-22).';
