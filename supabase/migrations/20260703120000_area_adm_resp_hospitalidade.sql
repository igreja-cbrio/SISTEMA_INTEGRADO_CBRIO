-- ============================================================================
-- Hospitalidade · valor novo no enum area_adm_resp (2026-07-03)
-- Natureza da raia Operações do BPMN (recepção, café, hospedagem de convidados).
-- ⚠️ PRECISA rodar em execução SEPARADA da 20260703120100 (Postgres não deixa
-- USAR um valor novo de enum na mesma transação em que ele foi adicionado).
-- ============================================================================
ALTER TYPE area_adm_resp ADD VALUE IF NOT EXISTS 'hospitalidade';
