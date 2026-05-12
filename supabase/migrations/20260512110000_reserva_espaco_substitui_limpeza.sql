-- ============================================================================
-- AJUSTE PARTE 1 · adiciona 'reserva_espaco' ao enum + campos novos
--
-- IMPORTANTE: Postgres exige que ADD VALUE em enum esteja em transacao
-- SEPARADA do uso desse valor. Por isso esta migration so adiciona o valor
-- e os campos novos. O uso do valor (INSERT/UPDATE/View) esta na migration
-- 20260512115000 · rode na ordem.
-- ============================================================================

-- Adiciona reserva_espaco ao enum
ALTER TYPE area_adm_resp ADD VALUE IF NOT EXISTS 'reserva_espaco';

-- Campos novos em solicitacoes · especificos para reserva de espaco
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS espaco_solicitado text,
  ADD COLUMN IF NOT EXISTS data_uso date,
  ADD COLUMN IF NOT EXISTS horario_inicio time,
  ADD COLUMN IF NOT EXISTS horario_fim time,
  ADD COLUMN IF NOT EXISTS qtde_pessoas int;

COMMENT ON COLUMN public.solicitacoes.espaco_solicitado IS 'Sala/auditorio/area solicitado (texto livre · pode virar FK depois).';
COMMENT ON COLUMN public.solicitacoes.data_uso IS 'Data do uso do espaco (reserva_espaco) ou data necessaria (outras categorias).';
