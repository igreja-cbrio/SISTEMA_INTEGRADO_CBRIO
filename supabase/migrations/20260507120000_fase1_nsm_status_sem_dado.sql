-- ============================================================================
-- FASE 1 · Patch: status NSM "sem_dado" quando total_convertidos = 0
--
-- Antes: total=0 caia em "vermelho" (porque 0% < 85% × 50%), o que parece
-- alerta de NSM ruim quando na realidade so nao ha dado ainda (triggers
-- que alimentam nsm_eventos sao da Fase 1.5).
--
-- Agora: status='sem_dado' (cinza no painel) quando ainda nao ha base
-- para avaliar. So vira verde/amarelo/vermelho quando houver convertidos
-- no periodo.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_nsm_painel AS
SELECT
  s.segmento,
  s.segmento_label,
  s.segmento_tipo,
  s.total_convertidos_periodo,
  s.engajados_em_60d,
  s.percentual,
  s.meta_percentual,
  s.delta_vs_mes_anterior,
  s.por_valor,
  s.janela_inicio,
  s.janela_fim,
  s.atualizado_em,
  CASE
    WHEN s.total_convertidos_periodo = 0 THEN 'sem_dado'
    WHEN s.percentual >= s.meta_percentual THEN 'verde'
    WHEN s.percentual >= s.meta_percentual * 0.85 THEN 'amarelo'
    ELSE 'vermelho'
  END AS status,
  (s.total_convertidos_periodo > 0) AS tem_dados
FROM public.nsm_estado s
WHERE s.ativo = true
ORDER BY
  CASE s.segmento
    WHEN 'central' THEN 1
    WHEN 'cbrio'   THEN 2
    WHEN 'online'  THEN 3
    WHEN 'cba'     THEN 4
    ELSE 9
  END;

GRANT SELECT ON public.vw_nsm_painel TO authenticated, service_role;

COMMENT ON VIEW public.vw_nsm_painel IS 'NSM consolidada para o painel. Status: sem_dado quando total_convertidos=0, senao verde/amarelo/vermelho contra meta_percentual.';
