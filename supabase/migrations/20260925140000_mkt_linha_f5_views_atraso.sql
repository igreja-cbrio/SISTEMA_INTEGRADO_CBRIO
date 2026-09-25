-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 5 · views de atraso (base dos indicadores)
-- (Marcos 2026-09-25 · depende de 20260925100000)
--
-- Só views de leitura para o backend. Os KPIs de verdade entram depois,
-- pelo catálogo de indicadores (ler project_catalogo_indicadores_v3 antes).
--
--   vw_marketing_prazos   · 1 linha por card vivo: frente, culto, prazo
--                           inicial × atual, conclusão, dias de atraso,
--                           nº de remarcações.
--   vw_marketing_triagem  · 1 linha por campanha de solicitação: horas até
--                           o Pedro alocar (created_at → triada_em).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.vw_marketing_prazos
WITH (security_invoker = true) AS
SELECT
  k.id                    AS card_id,
  CASE
    WHEN k.origem = 'evento' THEN 'institucional'
    WHEN c.origem = 'solicitacao' THEN 'sistema'
    ELSE 'interno'
  END                     AS frente,
  k.culto,
  k.atribuido_a,
  k.estado,
  k.prazo_inicial,
  public.fn_marketing_card_prazo_atual(k.data_fim, k.prazo_producao, k.prazo_confirmado, k.prazo_preliminar) AS prazo_atual,
  k.concluido_em,
  (k.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date AS concluido_dia,
  GREATEST(0,
    COALESCE((k.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    - public.fn_marketing_card_prazo_atual(k.data_fim, k.prazo_producao, k.prazo_confirmado, k.prazo_preliminar)
  )                       AS dias_atraso,
  GREATEST(0,
    COALESCE((k.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    - k.prazo_inicial
  )                       AS dias_atraso_vs_plano,
  (SELECT count(*) FROM public.marketing_card_prazo_historico h WHERE h.card_id = k.id) AS remarcacoes
FROM public.marketing_kanban_cards k
LEFT JOIN public.marketing_campanhas c ON c.id = k.campanha_id
WHERE k.deleted_at IS NULL;

COMMENT ON VIEW public.vw_marketing_prazos IS
  'Atraso por card. dias_atraso = contra o prazo atual; dias_atraso_vs_plano = contra a 1ª data planejada. Card aberto conta até hoje. Card sem prazo fica com NULL (não conta como no prazo · corrige o viés do MKT-PRAZO).';

CREATE OR REPLACE VIEW public.vw_marketing_triagem
WITH (security_invoker = true) AS
SELECT
  c.id AS campanha_id,
  c.status,
  c.created_at,
  c.triada_em,
  c.triada_por,
  round(EXTRACT(EPOCH FROM (COALESCE(c.triada_em, now()) - c.created_at)) / 3600.0, 1) AS horas_em_triagem
FROM public.marketing_campanhas c
WHERE c.origem = 'solicitacao' AND c.deleted_at IS NULL;

REVOKE ALL ON public.vw_marketing_prazos, public.vw_marketing_triagem FROM anon, authenticated;

COMMIT;
