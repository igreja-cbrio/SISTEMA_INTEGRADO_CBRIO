-- ============================================================================
-- Solicitacoes · Fase 0.2 + 0.3 · Reconciliacao de colunas + status + cargo
-- ============================================================================
-- 0.2 · Colunas de RESERVA DE ESPACO: sao lidas pelas views vw_reserva_espacos
--       e vw_solicitacoes_sla, e gravadas pelo backend, mas NUNCA foram criadas
--       por nenhuma migration (drift git<->prod · foram adicionadas direto no
--       SQL Editor). Um rebuild do banco a partir das migrations quebraria as
--       views. ADD COLUMN IF NOT EXISTS reconcilia · no-op em prod.
-- 0.2 · CHECK de status ganha os estados da Fase 1 (devolucao/cancelamento),
--       como preparo · nada produz esses valores ainda (a Fase 1 liga o fluxo
--       "Relatar Problema"). Aditivo.
-- 0.3 · Snapshot do CARGO do solicitante no momento do pedido. A AREA ja e'
--       gravada (area_cliente), mas o cargo nao · e cargo muda com o tempo,
--       entao precisa de snapshot pro rastreio historico (data/area/cargo/
--       servico do solicitante).
-- Idempotente. Atomica. Nao-destrutiva.
-- ============================================================================

BEGIN;

-- 0.2 · colunas de reserva (reconciliacao do drift · no-op se ja existem)
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS espaco_solicitado text,
  ADD COLUMN IF NOT EXISTS data_uso          date,
  ADD COLUMN IF NOT EXISTS horario_inicio    time,
  ADD COLUMN IF NOT EXISTS horario_fim       time,
  ADD COLUMN IF NOT EXISTS qtde_pessoas      integer;

-- 0.3 · snapshot do cargo do solicitante
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS cargo_solicitante text;

COMMENT ON COLUMN public.solicitacoes.cargo_solicitante IS
  'Snapshot do cargo do solicitante no momento da criacao (rastreio historico · cargo muda com o tempo). Fase 0 · 2026-06-12.';

-- 0.2 · CHECK de status · adiciona aguardando_ajuste + cancelado (preparo Fase 1)
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN (
    'aguardando_aprovacao_origem',
    'pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido',
    'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega', 'avaliado',
    'aguardando_ajuste', 'cancelado'   -- Fase 1 (Relatar Problema · devolucao/cancelamento) · preparo
  ));

COMMIT;
