-- ============================================================================
-- Solicitacoes · Fase 1 · "Relatar Problema" (alteracao/devolucao) + historico
-- ============================================================================
-- Decidido com Marcos (oficializacao do modulo):
--   - Botao "Relatar Problema" na solicitacao ja enviada · modal com motivo
--     (Descricao/Escopo/Data/Cancelamento) + comentario.
--   - SOLICITANTE relata = "preciso alterar/corrigir" -> volta editavel pra ele
--     refazer · conta no KPI diagnostico "solicitacoes refeitas" (NAO punitivo).
--   - RESPONSAVEL relata = "devolvo por falta de clareza" -> mesma coisa (volta
--     editavel pro solicitante) MAS protege o SLA de resposta da area.
--   - Descricao/Escopo/Data -> status 'aguardando_ajuste' (SLA pausa).
--     Cancelamento -> status 'cancelado' (terminal).
--   - Reenviar -> volta ao status anterior · SLA retoma (empurra o prazo pelo
--     tempo que ficou parado · area nao e' penalizada).
--   - Os status 'aguardando_ajuste'/'cancelado' ja entraram no CHECK na Fase 0.
-- Idempotente. Atomica. Nao-destrutiva.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Colunas de controle do ciclo de ajuste/devolucao
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS vezes_refeita        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_antes_ajuste  text,
  ADD COLUMN IF NOT EXISTS sla_pausado_em       timestamptz;

COMMENT ON COLUMN public.solicitacoes.vezes_refeita IS
  'Quantas vezes a solicitacao foi devolvida/alterada (KPI diagnostico "pedimos bem?" · nao punitivo). Fase 1.';
COMMENT ON COLUMN public.solicitacoes.status_antes_ajuste IS
  'Status em que a solicitacao estava antes de ir pra aguardando_ajuste · usado pra restaurar no reenvio. Fase 1.';
COMMENT ON COLUMN public.solicitacoes.sla_pausado_em IS
  'Quando o SLA foi pausado (entrou em aguardando_ajuste). No reenvio empurra os deadlines por (now - sla_pausado_em). Fase 1.';

-- ----------------------------------------------------------------------------
-- 2. Log de "Relatar Problema" · alimenta a linha do tempo + o KPI diagnostico
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.solicitacao_ajustes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  autor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lado           text NOT NULL CHECK (lado IN ('solicitante', 'responsavel')),
  motivo         text NOT NULL CHECK (motivo IN ('descricao', 'escopo', 'data', 'cancelamento')),
  comentario     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.solicitacao_ajustes IS
  'Registros de "Relatar Problema" (alteracao do solicitante OU devolucao do responsavel). Alimenta a linha do tempo e o KPI diagnostico de solicitacoes refeitas. Fase 1 · 2026-06-12.';

CREATE INDEX IF NOT EXISTS idx_solic_ajustes
  ON public.solicitacao_ajustes (solicitacao_id, created_at DESC);

-- RLS · leitura aberta a authenticated (transparencia · igual solicitacoes_eventos);
-- escrita so service_role (todo o fluxo passa pelo backend).
ALTER TABLE public.solicitacao_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solic_ajustes_read ON public.solicitacao_ajustes;
CREATE POLICY solic_ajustes_read ON public.solicitacao_ajustes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS solic_ajustes_service ON public.solicitacao_ajustes;
CREATE POLICY solic_ajustes_service ON public.solicitacao_ajustes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
