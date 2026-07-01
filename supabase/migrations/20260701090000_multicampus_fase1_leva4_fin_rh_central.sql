-- Multi-campus · FASE 1 · Leva 4 · Financeiro/RH = CENTRAL (2026-07-01)
-- Decisão da gestão (revisa a decisão #3): Financeiro e RH são CENTRAIS — um
-- único DRE/folha para a rede inteira, sem separação por campus. A Fase 0
-- havia semeado esses módulos como 'isolado'; corrige para 'compartilhado'.
-- Consequência: NÃO se carimba igreja_id em fin_*/rh_* (nenhuma RLS por campus
-- nesses módulos). Só config; nenhuma mudança de schema/dado operacional.
UPDATE public.modulos SET escopo_campus = 'compartilhado' WHERE slug IN ('financeiro', 'rh');
