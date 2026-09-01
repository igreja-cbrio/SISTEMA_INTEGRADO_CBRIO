-- ============================================================================
-- KRs · desativação em massa (decisão do Marcos · 21/08/2026)
--
-- Contexto (análise de 20-21/08 na base viva): 637 KRs em kpi_krs, 316 ativos
-- — 58 "gerais" + 258 cópias de cascata (mesmo texto repetido por área) —,
-- apenas 44 com fonte_kpi_id (14%) e 1 único KR geral medido. A camada não
-- guarda dado (a medição vive em kpi_registros/kpi_valores_calculados e chega
-- ao KR por join de leitura) e era consumida só pela tela Estrutura OKR do
-- /gestao, pelo KpiEditorModal e pela aba do Devocional. Estruturalmente, os
-- KRs eram metas permanentes de KPI reescritas como frase (MBO cascateado
-- ×1,30), não resultados-chave de ciclo.
--
-- Decisão: aposentar a camada inteira. As metas/réguas aproveitáveis migram,
-- em fase própria, para meta de faixa do KPI ou para os OKRs DE CICLO
-- (trimestrais, pactuados, KR = delta sobre KPI vivo) — o desenho novo do
-- sistema de indicadores. Backlog de resgate documentado na memória da
-- sessão e no arquivo Downloads\desativar_krs_2026-08-21.sql do Marcos.
--
-- APLICADA EM PROD manualmente pelo Marcos em 21/08/2026 (verificação: 0
-- ativos). Este arquivo é o REGISTRO idempotente para manter git↔prod em
-- sincronia. Reversível: backup completo das 637 linhas em
-- Downloads\backup_kpi_krs_2026-08-21.json; nenhum DELETE foi feito.
-- ============================================================================

UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE ativo = true;
