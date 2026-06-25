-- ============================================================================
-- Produção · carga do cronograma real dos 4 cultos de 2026-06-07
-- (planilha "Cronograma Culto 07.06.2026 - Atualizada"). Espelha a carga de
-- 2026-06-14. Insere as etapas POR CULTO (previsto+executado em segundos) e
-- recomputa os totais do satélite culto_producao (igual ao recomputarTotais).
-- Casa o culto por (data × recurrence_time). REPLACE (idempotente).
-- IDs verificados em prod (read-only): 08:30=bab87ebf-8b12-4fab-9297-1a09d65b41e3
--   10:00=12d6a624-4500-4ba4-9642-e155d0f963a4 · 11:30=ca60e8ce-2425-4d8a-910b-e78b6aa859a2 · 19:00=60f23f02-e725-434e-8bbc-ed8f7558236f
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
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao) VALUES
      (v_culto, 1, 'Música 1', 239, 280, NULL, 'culto'),
      (v_culto, 2, 'Música 2', 343, 445, 'Intercessão foi feita dentro da música', 'culto'),
      (v_culto, 3, 'Intercessão', 180, 0, NULL, 'culto'),
      (v_culto, 4, 'Vídeo Testemunho', 74, 74, NULL, 'culto'),
      (v_culto, 5, 'Generosidade', 180, 195, NULL, 'culto'),
      (v_culto, 6, 'Música Dízimo', 140, 220, NULL, 'culto'),
      (v_culto, 7, 'Vídeo Pré-Pregação', 14, 14, NULL, 'culto'),
      (v_culto, 8, 'Pregação', 1800, 1870, 'Pedrão', 'culto'),
      (v_culto, 9, 'Apelo', 300, 270, NULL, 'culto'),
      (v_culto, 10, 'Música Ceia', 140, 255, NULL, 'culto'),
      (v_culto, 11, 'Avisos', 120, 0, 'Não foi feito.', 'culto'),
      (v_culto, 12, 'Benção', 60, 60, NULL, 'culto'),
      (v_culto, 13, 'Pós-Culto', 180, 120, 'Renata', 'pos_culto');
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
      duracao_segundos       = EXCLUDED.duracao_segundos,
      duracao_prevista_seg   = EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos     = EXCLUDED.pos_culto_segundos,
      pos_culto_previsto_seg = EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos        = EXCLUDED.duracao_minutos,
      updated_at             = now();
    RAISE NOTICE 'Domingo 08:30: etapas carregadas (culto %)', v_culto;
  ELSE
    RAISE NOTICE 'Domingo 08:30 NAO encontrado em 2026-06-07 (pulado)';
  END IF;

  -- ===== Domingo 10:00 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '10:00:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao) VALUES
      (v_culto, 1, 'Música 1', 239, 282, NULL, 'culto'),
      (v_culto, 2, 'Música 2', 343, 455, 'Intercessão foi feita dentro da música', 'culto'),
      (v_culto, 3, 'Intercessão', 180, 0, NULL, 'culto'),
      (v_culto, 4, 'Vídeo Testemunho', 74, 74, NULL, 'culto'),
      (v_culto, 5, 'Generosidade', 240, 280, NULL, 'culto'),
      (v_culto, 6, 'Música Dízimo', 140, 220, NULL, 'culto'),
      (v_culto, 7, 'Vídeo Pré-Pregação', 14, 14, NULL, 'culto'),
      (v_culto, 8, 'Pregação', 1800, 1800, 'Pedrão', 'culto'),
      (v_culto, 9, 'Apelo', 300, 160, NULL, 'culto'),
      (v_culto, 10, 'Música Ceia', 140, 192, NULL, 'culto'),
      (v_culto, 11, 'Avisos', 120, 0, 'Feito junto com a Generosidade', 'culto'),
      (v_culto, 12, 'Benção', 60, 81, NULL, 'culto'),
      (v_culto, 13, 'Pós-Culto', 180, 170, 'Camila', 'pos_culto');
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
      duracao_segundos       = EXCLUDED.duracao_segundos,
      duracao_prevista_seg   = EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos     = EXCLUDED.pos_culto_segundos,
      pos_culto_previsto_seg = EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos        = EXCLUDED.duracao_minutos,
      updated_at             = now();
    RAISE NOTICE 'Domingo 10:00: etapas carregadas (culto %)', v_culto;
  ELSE
    RAISE NOTICE 'Domingo 10:00 NAO encontrado em 2026-06-07 (pulado)';
  END IF;

  -- ===== Domingo 11:30 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '11:30:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao) VALUES
      (v_culto, 1, 'Música 1', 239, 285, NULL, 'culto'),
      (v_culto, 2, 'Música 2', 343, 473, 'Intercessão foi feita dentro da música', 'culto'),
      (v_culto, 3, 'Intercessão', 180, 0, NULL, 'culto'),
      (v_culto, 4, 'Vídeo Testemunho', 74, 74, NULL, 'culto'),
      (v_culto, 5, 'Generosidade', 240, 240, NULL, 'culto'),
      (v_culto, 6, 'Música Dízimo', 140, 220, NULL, 'culto'),
      (v_culto, 7, 'Vídeo Pré-Pregação', 14, 14, NULL, 'culto'),
      (v_culto, 8, 'Pregação', 1800, 2015, 'Pedrão', 'culto'),
      (v_culto, 9, 'Apelo', 300, 270, NULL, 'culto'),
      (v_culto, 10, 'Música Ceia', 140, 260, NULL, 'culto'),
      (v_culto, 11, 'Avisos', 120, 0, 'Feito junto com a Generosidade', 'culto'),
      (v_culto, 12, 'Benção', 60, 84, NULL, 'culto'),
      (v_culto, 13, 'Pós-Culto', 180, 195, 'Camila', 'pos_culto');
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
      duracao_segundos       = EXCLUDED.duracao_segundos,
      duracao_prevista_seg   = EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos     = EXCLUDED.pos_culto_segundos,
      pos_culto_previsto_seg = EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos        = EXCLUDED.duracao_minutos,
      updated_at             = now();
    RAISE NOTICE 'Domingo 11:30: etapas carregadas (culto %)', v_culto;
  ELSE
    RAISE NOTICE 'Domingo 11:30 NAO encontrado em 2026-06-07 (pulado)';
  END IF;

  -- ===== Domingo 19:00 =====
  SELECT c.id INTO v_culto FROM public.cultos c
    JOIN public.vol_service_types vst ON vst.id = c.service_type_id
   WHERE c.data = DATE '2026-06-07' AND vst.recurrence_time = TIME '19:00:00';
  IF v_culto IS NOT NULL THEN
    DELETE FROM public.culto_producao_etapas WHERE culto_id = v_culto;
    INSERT INTO public.culto_producao_etapas (culto_id, ordem, titulo, previsto_seg, executado_seg, observacao, secao) VALUES
      (v_culto, 1, 'Música 1', 239, 275, NULL, 'culto'),
      (v_culto, 2, 'Música 2', 343, 462, 'Intercessão foi feita dentro da música', 'culto'),
      (v_culto, 3, 'Intercessão', 180, 0, NULL, 'culto'),
      (v_culto, 4, 'Vídeo Testemunho', 74, 74, NULL, 'culto'),
      (v_culto, 5, 'Generosidade', 240, 250, NULL, 'culto'),
      (v_culto, 6, 'Música Dízimo', 140, 220, NULL, 'culto'),
      (v_culto, 7, 'Vídeo Pré-Pregação', 14, 14, NULL, 'culto'),
      (v_culto, 8, 'Pregação', 1800, 1835, 'Pedrão', 'culto'),
      (v_culto, 9, 'Apelo', 300, 260, NULL, 'culto'),
      (v_culto, 10, 'Música Ceia', 140, 250, NULL, 'culto'),
      (v_culto, 11, 'Avisos', 120, 0, 'Feito junto com a Generosidade', 'culto'),
      (v_culto, 12, 'Benção', 60, 65, NULL, 'culto'),
      (v_culto, 13, 'Pós-Culto', 180, 142, 'Renata', 'pos_culto');
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
      duracao_segundos       = EXCLUDED.duracao_segundos,
      duracao_prevista_seg   = EXCLUDED.duracao_prevista_seg,
      pos_culto_segundos     = EXCLUDED.pos_culto_segundos,
      pos_culto_previsto_seg = EXCLUDED.pos_culto_previsto_seg,
      duracao_minutos        = EXCLUDED.duracao_minutos,
      updated_at             = now();
    RAISE NOTICE 'Domingo 19:00: etapas carregadas (culto %)', v_culto;
  ELSE
    RAISE NOTICE 'Domingo 19:00 NAO encontrado em 2026-06-07 (pulado)';
  END IF;

END $$;

