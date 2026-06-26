-- ============================================================================
-- Produção · remove o momento "Intercessão" dos 4 cultos de 2026-06-07
--
-- Marcos (2026-06-26): a Intercessão ficava com executado 0:00 em todos os cultos
-- porque foi feita DENTRO da Música 2 (ver observação). Remove o momento separado e
-- soma o previsto dela (3:00) na Música 2 — assim o previsto total do culto NÃO muda
-- (~60min) e a Música 2 passa a mostrar previsto×executado coerente (corrige o falso
-- "estouro" da música e o falso "-3:00" da intercessão).
--
-- Cada culto vai de 10 → 9 momentos. Executado total inalterado (intercessão era 0).
-- REPLACE idempotente das etapas + recomputa o satélite culto_producao.
-- Supersede a 20260626120000 (que consolidou os momentos).
-- ============================================================================

DO $$
DECLARE v_culto uuid;
BEGIN
  -- ===== Domingo 08:30 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '08:30:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao, tipo, categoria_especial) VALUES
      (v_culto, 1, 'Música 1',           239,  280, NULL, 'culto', 'padrao', NULL),
      (v_culto, 2, 'Música 2',           523,  445, 'Intercessão foi feita dentro da música', 'culto', 'padrao', NULL),
      (v_culto, 3, 'Dízimos e Ofertas',  320,  415, NULL, 'culto', 'padrao', NULL),
      (v_culto, 4, 'Vídeo Pré-Pregação',  88,   88, NULL, 'culto', 'padrao', NULL),
      (v_culto, 5, 'Pregação',          1800, 1870, 'Pedrão', 'culto', 'padrao', NULL),
      (v_culto, 6, 'Apelo',              300,  270, NULL, 'culto', 'padrao', NULL),
      (v_culto, 7, 'Ceia',               140,  255, NULL, 'culto', 'especial', 'ceia'),
      (v_culto, 8, 'Avisos / Benção',    180,   60, 'Avisos não foi feito', 'culto', 'padrao', NULL),
      (v_culto, 9, 'Pós-Culto',          180,  120, 'Renata', 'pos_culto', 'padrao', NULL);
    INSERT INTO public.culto_producao (culto_id, duracao_segundos, duracao_prevista_seg, pos_culto_segundos, pos_culto_previsto_seg, duracao_minutos, preenchido_em, updated_at)
    SELECT v_culto,
      SUM(executado_seg) FILTER (WHERE secao='culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='culto'),
      SUM(executado_seg) FILTER (WHERE secao='pos_culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='pos_culto'),
      ROUND(SUM(executado_seg) FILTER (WHERE secao='culto') / 60.0)::int,
      now(), now()
    FROM public.culto_producao_etapas WHERE culto_id = v_culto
    ON CONFLICT (culto_id) DO UPDATE SET
      duracao_segundos=EXCLUDED.duracao_segundos, duracao_prevista_seg=EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos=EXCLUDED.pos_culto_segundos, pos_culto_previsto_seg=EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos=EXCLUDED.duracao_minutos, updated_at=now();
    RAISE NOTICE 'Domingo 08:30: Intercessão removida (culto %)', v_culto;
  ELSE RAISE NOTICE 'Domingo 08:30 NAO encontrado (pulado)'; END IF;

  -- ===== Domingo 10:00 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '10:00:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao, tipo, categoria_especial) VALUES
      (v_culto, 1, 'Música 1',           239,  282, NULL, 'culto', 'padrao', NULL),
      (v_culto, 2, 'Música 2',           523,  455, 'Intercessão foi feita dentro da música', 'culto', 'padrao', NULL),
      (v_culto, 3, 'Dízimos e Ofertas',  380,  500, NULL, 'culto', 'padrao', NULL),
      (v_culto, 4, 'Vídeo Pré-Pregação',  88,   88, NULL, 'culto', 'padrao', NULL),
      (v_culto, 5, 'Pregação',          1800, 1800, 'Pedrão', 'culto', 'padrao', NULL),
      (v_culto, 6, 'Apelo',              300,  160, NULL, 'culto', 'padrao', NULL),
      (v_culto, 7, 'Ceia',               140,  192, NULL, 'culto', 'especial', 'ceia'),
      (v_culto, 8, 'Avisos / Benção',    180,   81, 'Avisos feito junto com a Generosidade', 'culto', 'padrao', NULL),
      (v_culto, 9, 'Pós-Culto',          180,  170, 'Camila', 'pos_culto', 'padrao', NULL);
    INSERT INTO public.culto_producao (culto_id, duracao_segundos, duracao_prevista_seg, pos_culto_segundos, pos_culto_previsto_seg, duracao_minutos, preenchido_em, updated_at)
    SELECT v_culto,
      SUM(executado_seg) FILTER (WHERE secao='culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='culto'),
      SUM(executado_seg) FILTER (WHERE secao='pos_culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='pos_culto'),
      ROUND(SUM(executado_seg) FILTER (WHERE secao='culto') / 60.0)::int,
      now(), now()
    FROM public.culto_producao_etapas WHERE culto_id = v_culto
    ON CONFLICT (culto_id) DO UPDATE SET
      duracao_segundos=EXCLUDED.duracao_segundos, duracao_prevista_seg=EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos=EXCLUDED.pos_culto_segundos, pos_culto_previsto_seg=EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos=EXCLUDED.duracao_minutos, updated_at=now();
    RAISE NOTICE 'Domingo 10:00: Intercessão removida (culto %)', v_culto;
  ELSE RAISE NOTICE 'Domingo 10:00 NAO encontrado (pulado)'; END IF;

  -- ===== Domingo 11:30 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '11:30:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao, tipo, categoria_especial) VALUES
      (v_culto, 1, 'Música 1',           239,  285, NULL, 'culto', 'padrao', NULL),
      (v_culto, 2, 'Música 2',           523,  473, 'Intercessão foi feita dentro da música', 'culto', 'padrao', NULL),
      (v_culto, 3, 'Dízimos e Ofertas',  380,  460, NULL, 'culto', 'padrao', NULL),
      (v_culto, 4, 'Vídeo Pré-Pregação',  88,   88, NULL, 'culto', 'padrao', NULL),
      (v_culto, 5, 'Pregação',          1800, 2015, 'Pedrão', 'culto', 'padrao', NULL),
      (v_culto, 6, 'Apelo',              300,  270, NULL, 'culto', 'padrao', NULL),
      (v_culto, 7, 'Ceia',               140,  260, NULL, 'culto', 'especial', 'ceia'),
      (v_culto, 8, 'Avisos / Benção',    180,   84, 'Avisos feito junto com a Generosidade', 'culto', 'padrao', NULL),
      (v_culto, 9, 'Pós-Culto',          180,  195, 'Camila', 'pos_culto', 'padrao', NULL);
    INSERT INTO public.culto_producao (culto_id, duracao_segundos, duracao_prevista_seg, pos_culto_segundos, pos_culto_previsto_seg, duracao_minutos, preenchido_em, updated_at)
    SELECT v_culto,
      SUM(executado_seg) FILTER (WHERE secao='culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='culto'),
      SUM(executado_seg) FILTER (WHERE secao='pos_culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='pos_culto'),
      ROUND(SUM(executado_seg) FILTER (WHERE secao='culto') / 60.0)::int,
      now(), now()
    FROM public.culto_producao_etapas WHERE culto_id = v_culto
    ON CONFLICT (culto_id) DO UPDATE SET
      duracao_segundos=EXCLUDED.duracao_segundos, duracao_prevista_seg=EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos=EXCLUDED.pos_culto_segundos, pos_culto_previsto_seg=EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos=EXCLUDED.duracao_minutos, updated_at=now();
    RAISE NOTICE 'Domingo 11:30: Intercessão removida (culto %)', v_culto;
  ELSE RAISE NOTICE 'Domingo 11:30 NAO encontrado (pulado)'; END IF;

  -- ===== Domingo 19:00 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '19:00:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao, tipo, categoria_especial) VALUES
      (v_culto, 1, 'Música 1',           239,  275, NULL, 'culto', 'padrao', NULL),
      (v_culto, 2, 'Música 2',           523,  462, 'Intercessão foi feita dentro da música', 'culto', 'padrao', NULL),
      (v_culto, 3, 'Dízimos e Ofertas',  380,  470, NULL, 'culto', 'padrao', NULL),
      (v_culto, 4, 'Vídeo Pré-Pregação',  88,   88, NULL, 'culto', 'padrao', NULL),
      (v_culto, 5, 'Pregação',          1800, 1835, 'Pedrão', 'culto', 'padrao', NULL),
      (v_culto, 6, 'Apelo',              300,  260, NULL, 'culto', 'padrao', NULL),
      (v_culto, 7, 'Ceia',               140,  250, NULL, 'culto', 'especial', 'ceia'),
      (v_culto, 8, 'Avisos / Benção',    180,   65, 'Avisos feito junto com a Generosidade', 'culto', 'padrao', NULL),
      (v_culto, 9, 'Pós-Culto',          180,  142, 'Renata', 'pos_culto', 'padrao', NULL);
    INSERT INTO public.culto_producao (culto_id, duracao_segundos, duracao_prevista_seg, pos_culto_segundos, pos_culto_previsto_seg, duracao_minutos, preenchido_em, updated_at)
    SELECT v_culto,
      SUM(executado_seg) FILTER (WHERE secao='culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='culto'),
      SUM(executado_seg) FILTER (WHERE secao='pos_culto'),
      SUM(previsto_seg)  FILTER (WHERE secao='pos_culto'),
      ROUND(SUM(executado_seg) FILTER (WHERE secao='culto') / 60.0)::int,
      now(), now()
    FROM public.culto_producao_etapas WHERE culto_id = v_culto
    ON CONFLICT (culto_id) DO UPDATE SET
      duracao_segundos=EXCLUDED.duracao_segundos, duracao_prevista_seg=EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos=EXCLUDED.pos_culto_segundos, pos_culto_previsto_seg=EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos=EXCLUDED.duracao_minutos, updated_at=now();
    RAISE NOTICE 'Domingo 19:00: Intercessão removida (culto %)', v_culto;
  ELSE RAISE NOTICE 'Domingo 19:00 NAO encontrado (pulado)'; END IF;

END $$;
