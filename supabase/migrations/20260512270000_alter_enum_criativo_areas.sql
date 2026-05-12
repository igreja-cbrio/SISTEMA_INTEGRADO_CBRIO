-- ============================================================================
-- Adiciona areas do Criativo ao enum area_adm_resp
--
-- Marcos: matriz Criativo × Area, com areas: Produção, Adoração, Marketing
--
-- IMPORTANTE: Postgres exige que ALTER TYPE ADD VALUE seja commitado antes
-- de ser usado em outras instrucoes · por isso esta em migration separada
-- da seed dos OKRs (20260512280000).
-- ============================================================================

ALTER TYPE public.area_adm_resp ADD VALUE IF NOT EXISTS 'producao';
ALTER TYPE public.area_adm_resp ADD VALUE IF NOT EXISTS 'adoracao';
ALTER TYPE public.area_adm_resp ADD VALUE IF NOT EXISTS 'marketing';

-- Conferencia (descomenta no Studio):
-- SELECT unnest(enum_range(NULL::area_adm_resp));
-- Espera: 11 valores · 8 originais + criativo (legado) + 3 novos
