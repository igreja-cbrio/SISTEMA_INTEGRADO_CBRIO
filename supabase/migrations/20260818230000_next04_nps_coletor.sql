-- ============================================================================
-- NEXT-04 "NPS do NEXT" passa a ser coletado automaticamente  ·  2026-08-18
-- ----------------------------------------------------------------------------
-- O QUE ESTAVA QUEBRADO (medido em prod em 18/08/2026):
--   A pesquisa de satisfação do Next coleta bem — o link público responde 200 e
--   a resposta cai íntegra em `nps_respostas`, com a turma etiquetada. Mas o
--   número morria ali:
--     · NEXT-04 estava `ativo=false`, `fonte_auto=NULL`, `tipo_calculo='manual'`
--       e com ZERO linhas em `kpi_registros` — nenhum coletor o alimentava;
--     · o único destino automático era `dados_brutos`, e `npsKpiSync` carimba o
--       agregado com a `data_inicio` da PESQUISA. Como a pesquisa do Next é
--       perpétua (nasceu 22/07/2026, sem `data_fim`), a resposta de 09/08 foi
--       gravada com data 2026-07-22 — e `tipos_dado_bruto.nps_next` é MENSAL.
--       Ou seja: agosto vazio, e todo mês futuro empilhando no mesmo ponto de
--       julho.
--
-- O QUE ESTA MIGRATION FAZ:
--   Liga o NEXT-04 no coletor novo `next.nps` (backend/services/kpiAutoCollector.js),
--   que lê `nps_respostas` direto com a janela do período — assim cada mês fica
--   com o seu e a série mensal passa a existir de verdade.
--
--   O prefixo `next.` é de propósito: além do cron diário
--   (`coletarTodos({ fecharAnterior: true })`), o hook `recalcularKpisNext()`
--   em backend/routes/next.js:48 filtra por `fontes: ['next.']` e passa a
--   recolher este KPI junto com NEXT-01/02/03.
--
--   `tipo_calculo` fica em 'manual' de propósito — é o mesmo valor dos cinco
--   CULTO-NPS-* que já funcionam em produção; quem manda no automático é o par
--   (`ativo`, `fonte_auto`).
--
-- NÃO MEXE em NEXT-01/02/03 (que também estão `ativo=false` apesar de já terem
-- coletor escrito): ligá-los muda o que a presidência vê e é decisão de gestão,
-- não de código.
--
-- Aditivo e idempotente.
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
SET    fonte_auto = 'next.nps',
       ativo      = true,
       updated_at = now()
WHERE  id = 'NEXT-04'
  AND  deleted_at IS NULL
  AND  (fonte_auto IS DISTINCT FROM 'next.nps' OR ativo IS DISTINCT FROM true);

COMMENT ON COLUMN public.kpi_indicadores_taticos.fonte_auto IS
  'Chave do coletor em backend/services/kpiAutoCollector.js (COLLECTORS). NULL = preenchimento manual. Prefixo antes do ponto agrupa a família (ex.: next.*) e é usado pelos filtros de recoleta.';

-- ── Conferência ─────────────────────────────────────────────────────────────
-- SELECT id, indicador, periodicidade, ativo, fonte_auto, meta_valor, unidade
-- FROM   public.kpi_indicadores_taticos WHERE id = 'NEXT-04';
-- Esperado: mensal · ativo=true · fonte_auto='next.nps' · meta 70 · nota
--
-- Depois do próximo cron (ou de POST /api/kpis/v2/cron/coletar):
-- SELECT periodo_referencia, valor_realizado, observacoes
-- FROM   public.kpi_registros WHERE indicador_id = 'NEXT-04'
-- ORDER  BY periodo_referencia DESC;
-- Esperado hoje: 2026-08 · 100 · "1 resposta(s) ... ATENCAO amostra pequena (n=1)"
