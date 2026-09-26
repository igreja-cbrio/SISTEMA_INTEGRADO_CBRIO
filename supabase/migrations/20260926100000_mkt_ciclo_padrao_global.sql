-- ════════════════════════════════════════════════════════════════════════
-- Marketing · o ciclo criativo PADRÃO do Marketing vira a matriz por culto
-- (Marcos 2026-09-26 · depende de 20260925110000_mkt_linha_f2_ciclo_por_culto)
--
-- Pedido: "remodele o ciclo criativo padrão na área de eventos para marketing
-- ... mantenha as fases do ciclo, mas agora as entregas por fase são essas, e
-- adicione a lógica por culto lá também". Decisão: vale para TODOS os eventos
-- com ciclo, não só Série.
--
-- O que muda:
--   1. A matriz (marketing_ciclo_padroes + marketing_ciclo_itens_padrao), que
--      era só da Série, vira GLOBAL (category_id NULL). Linha de categoria
--      continua podendo existir e GANHA da global (exceção por categoria).
--   2. Todo evento com ciclo é por culto: sem cultos no evento nem na categoria,
--      vale CBRio (o culto principal). Série segue CBRio + AMI + Kids.
--      ⇒ o espelho antigo (cycle_phase_tasks → card) deixa de rodar.
--   3. As 7 tarefas antigas de marketing em adm_task_templates ficam INATIVAS
--      (não apaga: o toggle só vale para ciclos novos, e o histórico fica).
--   4. Ciclos ativos de eventos futuros ganham as tarefas novas — só das fases
--      que ainda não terminaram (fase passada criada agora nasceria atrasada).
-- Backup em backups._bk_20260926_ciclo_padrao_*.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Backups ──────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS backups;
CREATE TABLE IF NOT EXISTS backups._bk_20260926_ciclo_padrao_padroes AS SELECT * FROM public.marketing_ciclo_padroes;
CREATE TABLE IF NOT EXISTS backups._bk_20260926_ciclo_padrao_itens   AS SELECT * FROM public.marketing_ciclo_itens_padrao;
CREATE TABLE IF NOT EXISTS backups._bk_20260926_ciclo_padrao_adm_tpl AS
  SELECT * FROM public.adm_task_templates WHERE lower(area) = 'marketing';

-- ── 1. Matriz global ────────────────────────────────────────────────────
ALTER TABLE public.marketing_ciclo_padroes      ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE public.marketing_ciclo_itens_padrao ALTER COLUMN category_id DROP NOT NULL;

-- NULL não conflita em UNIQUE: a chave passa a tratar "global" como um valor.
DROP INDEX IF EXISTS public.uq_marketing_ciclo_padroes_fase_culto;
CREATE UNIQUE INDEX uq_marketing_ciclo_padroes_fase_culto
  ON public.marketing_ciclo_padroes
     (COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_fase, COALESCE(culto, '*'));

-- A matriz da Série é a matriz do Marcos: vira a global (sem cópia = uma verdade só).
UPDATE public.marketing_ciclo_padroes p
   SET category_id = NULL, updated_at = now()
  FROM public.event_categories c
 WHERE p.category_id = c.id AND c.name IN ('Série', 'Serie', 'Séries');

UPDATE public.marketing_ciclo_itens_padrao i
   SET category_id = NULL, updated_at = now()
  FROM public.event_categories c
 WHERE i.category_id = c.id AND c.name IN ('Série', 'Serie', 'Séries');

COMMENT ON COLUMN public.marketing_ciclo_padroes.category_id IS
  'NULL = padrão global do Marketing (vale para todo evento com ciclo). Com categoria, é exceção e ganha da global.';
COMMENT ON COLUMN public.marketing_ciclo_itens_padrao.category_id IS
  'NULL = entregas padrão globais. Se a categoria tiver QUALQUER item ativo naquela fase, a lista dela substitui a global.';

-- ── 2. Todo evento com ciclo é por culto (default CBRio) ────────────────
CREATE OR REPLACE FUNCTION public.fn_marketing_cultos_do_evento(p_event_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.marketing_evento_cultos WHERE event_id = p_event_id) THEN
    RETURN QUERY SELECT culto FROM public.marketing_evento_cultos WHERE event_id = p_event_id ORDER BY 1;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketing_categoria_cultos cc
               JOIN public.events e ON e.category_id = cc.category_id
              WHERE e.id = p_event_id) THEN
    RETURN QUERY
      SELECT cc.culto FROM public.marketing_categoria_cultos cc
        JOIN public.events e ON e.category_id = cc.category_id
       WHERE e.id = p_event_id ORDER BY 1;
    RETURN;
  END IF;
  -- sem configuração: o culto principal (2026-09-26 · antes caía no espelho antigo)
  IF EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN NEXT 'cbrio';
  END IF;
END;
$$;

-- ── 3. Gerador: categoria ganha da global ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_marketing_ciclo_gerar_fase(p_phase_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f          record;
  v_cat      uuid;
  v_cat_itens uuid;
  v_culto    text;
  v_pad      record;
  v_card     uuid;
  v_n        int := 0;
  v_feita    timestamptz;
BEGIN
  SELECT * INTO f FROM public.event_cycle_phases WHERE id = p_phase_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT category_id INTO v_cat FROM public.events WHERE id = f.event_id;

  -- lista de entregas: a da categoria (se tiver alguma ativa nesta fase) ou a global
  v_cat_itens := CASE WHEN v_cat IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.marketing_ciclo_itens_padrao
       WHERE ativo AND category_id = v_cat AND nome_fase = f.nome_fase)
    THEN v_cat END;

  -- fase que o modelo antigo JÁ concluiu: o card nasce concluído (ver F2)
  SELECT max(t.updated_at) INTO v_feita
    FROM public.cycle_phase_tasks t
   WHERE t.event_phase_id = f.id AND lower(t.area) = 'marketing' AND t.status = 'concluida';

  FOR v_culto IN SELECT * FROM public.fn_marketing_cultos_do_evento(f.event_id) LOOP
    -- categoria > global · culto específico > "todos os cultos"
    SELECT p.atribuido_a, p.etiqueta_tipo_id, p.visibilidade INTO v_pad
      FROM public.marketing_ciclo_padroes p
     WHERE (p.category_id = v_cat OR p.category_id IS NULL)
       AND p.nome_fase = f.nome_fase AND p.ativo
       AND (p.culto = v_culto OR p.culto IS NULL)
     ORDER BY (p.category_id IS NULL), (p.culto IS NULL)
     LIMIT 1;
    CONTINUE WHEN NOT FOUND;

    v_card := NULL;
    INSERT INTO public.marketing_kanban_cards (
      origem, event_id, event_phase_id, culto, titulo,
      etiqueta_tipo_id, atribuido_a, visibilidade,
      data_inicio, data_fim, prazo_preliminar, estado, concluido_em
    ) VALUES (
      'evento', f.event_id, f.id, v_culto, f.nome_fase,
      v_pad.etiqueta_tipo_id, v_pad.atribuido_a, v_pad.visibilidade,
      f.data_inicio_prevista::date, f.data_fim_prevista::date,
      CASE WHEN f.data_fim_prevista IS NOT NULL
           THEN (f.data_fim_prevista::date + time '18:00') AT TIME ZONE 'America/Sao_Paulo' END,
      CASE WHEN v_feita IS NOT NULL THEN 'concluido' ELSE 'backlog' END,
      v_feita
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_card;

    IF v_card IS NOT NULL THEN
      v_n := v_n + 1;
      INSERT INTO public.marketing_card_checklist
        (card_id, grupo, texto, membro_id, esforco_valor, esforco_unidade, exige_registro, prazo, feito, concluido_em)
      SELECT v_card, f.nome_fase, i.texto, i.membro_id, i.esforco_valor, i.esforco_unidade, i.exige_registro, f.data_fim_prevista::date,
             (v_feita IS NOT NULL AND NOT i.exige_registro),
             CASE WHEN v_feita IS NOT NULL AND NOT i.exige_registro THEN v_feita END
        FROM public.marketing_ciclo_itens_padrao i
       WHERE i.ativo AND i.category_id IS NOT DISTINCT FROM v_cat_itens AND i.nome_fase = f.nome_fase
         AND (i.culto IS NULL OR i.culto = v_culto)
       ORDER BY i.ordem, i.created_at;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_marketing_ciclo_gerar_fase(uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_cultos_do_evento(uuid)  FROM PUBLIC, anon, authenticated;

-- ── 4. As 7 tarefas antigas de marketing saem do padrão de Eventos ──────
UPDATE public.adm_task_templates
   SET ativo = false, updated_at = now()
 WHERE lower(area) = 'marketing' AND ativo;

-- ── 5. Ciclos ativos de eventos futuros · só fases que ainda não terminaram
DO $$
DECLARE
  v_fase uuid;
  v_n    int := 0;
BEGIN
  FOR v_fase IN
    SELECT ecp.id
      FROM public.event_cycle_phases ecp
      JOIN public.event_cycles ec ON ec.event_id = ecp.event_id AND ec.status = 'ativo'
      JOIN public.events e        ON e.id = ecp.event_id
     WHERE e.date >= current_date
       AND (ecp.data_fim_prevista IS NULL OR ecp.data_fim_prevista::date >= current_date)
     ORDER BY e.date, ecp.numero_fase
  LOOP
    v_n := v_n + public.fn_marketing_ciclo_gerar_fase(v_fase);
  END LOOP;
  RAISE NOTICE 'Tarefas de marketing geradas nos ciclos ativos: %', v_n;
END $$;

COMMIT;

-- Conferência:
--   SELECT category_id IS NULL AS global, count(*) FROM marketing_ciclo_padroes GROUP BY 1;
--   SELECT count(*) FROM adm_task_templates WHERE lower(area)='marketing' AND ativo;   -- 0
--   SELECT e.name, count(k.*) FROM marketing_kanban_cards k JOIN events e ON e.id=k.event_id
--    WHERE k.event_phase_id IS NOT NULL AND k.deleted_at IS NULL GROUP BY 1;
