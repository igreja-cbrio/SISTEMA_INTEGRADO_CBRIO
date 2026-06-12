-- ============================================================================
-- Totem Kids · pareamento de tablet/celular com estacao
--
-- Marcos (2026-05-21): "esse é um módulo de totem, então você precisa garantir
-- que no celular dos voluntários e no tablete fique boa a visualização.
-- Inclusive, verfique a aba de estações, como vamos vincular o tablete na
-- estação, provavelmente vamos precisar de um link específico com senha por
-- totem ou login, pensa sobre isso e traga uma solução".
--
-- Solucao escolhida · pareamento por QR + token (sem login adicional):
--   1. Cada kids_estacoes ganha token_pareamento UUID
--   2. Admin gera QR code da URL /ministerial/totem-kids/parear?estacao=X&token=T
--   3. Tablet escaneia uma vez · salva {estacao_id, token} no localStorage
--   4. Todo check-in subsequente envia estacao_id automaticamente
--   5. Voluntario que opera o tablet usa seu proprio login normal · pareamento
--      identifica DEVICE, nao pessoa
--   6. Admin pode regenerar token pra revogar tablet perdido
-- ============================================================================

BEGIN;

-- 1. Coluna token_pareamento (UUID gerado automatico)
ALTER TABLE public.kids_estacoes
  ADD COLUMN IF NOT EXISTS token_pareamento uuid NOT NULL DEFAULT gen_random_uuid();

-- 2. Unique index pra busca rapida ao parear
CREATE UNIQUE INDEX IF NOT EXISTS idx_kids_estacoes_token
  ON public.kids_estacoes(token_pareamento);

-- 3. Timestamps de auditoria
ALTER TABLE public.kids_estacoes
  ADD COLUMN IF NOT EXISTS pareada_em timestamptz,
  ADD COLUMN IF NOT EXISTS user_agent_pareada text;

COMMENT ON COLUMN public.kids_estacoes.token_pareamento IS
  'Token UUID pra parear tablet com essa estacao via QR. Regenerar revoga pareamento de tablets ativos.';
COMMENT ON COLUMN public.kids_estacoes.pareada_em IS
  'Quando foi pareada por ultimo (atualiza a cada POST /estacoes/parear bem-sucedido).';
COMMENT ON COLUMN public.kids_estacoes.user_agent_pareada IS
  'User-agent do device que pareou por ultimo (auditoria · ex: iPad Safari 17.0).';

COMMIT;
