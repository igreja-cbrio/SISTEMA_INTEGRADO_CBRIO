-- ============================================================================
-- Historico anual de cultos · agregacao por ano + tipo de culto
--
-- Marcos: "quero ter o historico de todos os anos daqui pra frente, entao so
--          vamos escalonar esse sistema. Nem que seja so carregar os ultimos
--          5 anos e ai deixar salvo em outra pagina os dados completos pra
--          analise."
--
-- Soluciona o "limit: 1000" do front · agregacao no SQL escala pra qualquer
-- volume porque retorna 1 linha por (ano, service_type) em vez de N cultos.
-- Em 50 anos × 7 service_types = 350 rows · trivial.
--
-- View NAO materializada · cada SELECT recalcula. Trade-off:
-- - Pro: sempre atualizado, zero overhead operacional
-- - Contra: lento se cultos passar de ~50k rows. Hoje temos 1.180.
-- Materializar depois quando o EXPLAIN mostrar gargalo.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_culto_historico_anual AS
SELECT
  EXTRACT(YEAR FROM c.data)::int                 AS ano,
  c.service_type_id,
  vst.name                                       AS service_type_name,
  vst.color                                      AS service_type_color,
  COUNT(*)                                       AS total_cultos,
  COUNT(*) FILTER (
    WHERE c.presencial_adulto > 0 OR c.presencial_kids > 0
  )                                              AS cultos_preenchidos,
  COALESCE(SUM(c.presencial_adulto), 0)::int     AS presencial_total,
  COALESCE(SUM(c.presencial_kids), 0)::int       AS kids_total,
  COALESCE(SUM(c.decisoes_presenciais), 0)::int  AS decisoes_presenciais_total,
  COALESCE(SUM(c.decisoes_online), 0)::int       AS decisoes_online_total,
  COALESCE(SUM(c.online_pico), 0)::int           AS online_pico_total,
  ROUND(AVG(c.online_pico) FILTER (WHERE c.online_pico > 0))::int AS online_pico_avg,
  COALESCE(SUM(c.online_ds), 0)::int             AS online_ds_total,
  COALESCE(SUM(c.online_ddus), 0)::int           AS online_ddus_total
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
GROUP BY ano, c.service_type_id, vst.name, vst.color
ORDER BY ano DESC, vst.name;

COMMENT ON VIEW public.vw_culto_historico_anual IS
  'Historico anual de frequencia, decisoes e online por tipo de culto · suporta qualquer volume sem limit no front';

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT * FROM vw_culto_historico_anual ORDER BY ano DESC LIMIT 20;
-- ============================================================================
