-- ============================================================================
-- cultura_mensal · campos manuais de frequencia, decisoes e conexao
--
-- Contexto: endpoint /api/kpis/cultura monta a mandala do /painel a partir
-- de duas fontes:
--   - Cultos individuais (tabela cultos): soma de presencial_adulto,
--     online_ds, decisoes_presenciais/online
--   - mem_grupo_membros: count de membros ativos em grupos (conectar)
--
-- Problema: nem todo mes tem cultos individuais lancados (ex.: backfill
-- historico, dados consolidados externos). Pra suportar lancar valor
-- consolidado por mes, ampliamos cultura_mensal com 4 colunas:
--
--   - freq_presencial_semanal: media semanal de presencial (ex: 2660)
--   - freq_online_semanal:     media semanal de online (ex: 4868)
--   - decisoes_total:          total mensal de decisoes (ex: 82)
--   - freq_grupos_total:       total mensal em grupos de conexao (ex: 1090)
--
-- Endpoint usa esses valores se preenchidos; senao cai pra agregado de
-- cultos/mem_grupo_membros (comportamento legado).
--
-- Idempotente · ADD COLUMN IF NOT EXISTS · sem impacto em dados existentes.
-- ============================================================================

ALTER TABLE public.cultura_mensal
  ADD COLUMN IF NOT EXISTS freq_presencial_semanal int,
  ADD COLUMN IF NOT EXISTS freq_online_semanal int,
  ADD COLUMN IF NOT EXISTS decisoes_total int,
  ADD COLUMN IF NOT EXISTS freq_grupos_total int;

COMMENT ON COLUMN public.cultura_mensal.freq_presencial_semanal IS
  'Media semanal de frequencia presencial. Se preenchido, sobrescreve calculo automatico a partir de cultos.';
COMMENT ON COLUMN public.cultura_mensal.freq_online_semanal IS
  'Media semanal de frequencia online. Se preenchido, sobrescreve calculo automatico a partir de cultos.';
COMMENT ON COLUMN public.cultura_mensal.decisoes_total IS
  'Total mensal de decisoes/conversoes. Se preenchido, sobrescreve calculo automatico a partir de cultos.';
COMMENT ON COLUMN public.cultura_mensal.freq_grupos_total IS
  'Total mensal de pessoas em grupos. Se preenchido, sobrescreve count de mem_grupo_membros (que e atual, nao historico).';
