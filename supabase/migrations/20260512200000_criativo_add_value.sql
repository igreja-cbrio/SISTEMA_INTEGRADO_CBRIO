-- ============================================================================
-- AREA ADM · adiciona 'criativo' ao enum
--
-- Marcos: "coloca area criativo tambem, futuramente vamos implementar"
--
-- IMPORTANTE: ADD VALUE em enum precisa estar comitado antes do uso (regra
-- do Postgres). Por isso esta migration so adiciona o valor · seed dos
-- OKRs/KPIs do criativo vai na 20260512210000.
-- ============================================================================

ALTER TYPE area_adm_resp ADD VALUE IF NOT EXISTS 'criativo';
