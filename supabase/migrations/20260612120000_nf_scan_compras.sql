-- Escanear nota fiscal (compras/logística) → categorizar → enviar pro financeiro
--
-- Fluxo: Amaury/Pery escaneiam a nota (foto/PDF) na aba Notas Fiscais da
-- Logística → IA extrai os dados + sugere plano de contas/centro de custo
-- (memória/regras do financeiro com fallback Haiku) → compras revisa e envia
-- pro financeiro → Yago confere e lança (vira fin_transacoes, conciliada com o
-- extrato OFX quando há débito correspondente).
--
-- NOTA (drift git↔prod · verificado no banco vivo em 2026-06-12): a tabela
-- log_notas_fiscais em produção já tem colunas que não constam em nenhuma
-- migration do repo (storage_path, origem, ml_order_id, xml_content,
-- emitente_nome, emitente_cnpj) e NÃO tem tipo/observacoes/created_by da
-- migration original. Os ADD COLUMN IF NOT EXISTS abaixo fazem o catch-up
-- nos dois sentidos e são no-op onde a coluna já existe.

-- ── 1. Catch-up do drift ────────────────────────────────────────────
ALTER TABLE public.log_notas_fiscais
  ADD COLUMN IF NOT EXISTS storage_path  TEXT,
  ADD COLUMN IF NOT EXISTS origem        TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ml_order_id   TEXT,
  ADD COLUMN IF NOT EXISTS xml_content   TEXT,
  ADD COLUMN IF NOT EXISTS emitente_nome TEXT,
  ADD COLUMN IF NOT EXISTS emitente_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS created_by    UUID,
  ADD COLUMN IF NOT EXISTS observacoes   TEXT;

-- ── 2. Fluxo scan → financeiro ──────────────────────────────────────
ALTER TABLE public.log_notas_fiscais
  ADD COLUMN IF NOT EXISTS status                   TEXT NOT NULL DEFAULT 'registrada',
  ADD COLUMN IF NOT EXISTS descricao                TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento          TEXT,
  ADD COLUMN IF NOT EXISTS itens                    JSONB,
  ADD COLUMN IF NOT EXISTS extracao_raw             JSONB,
  ADD COLUMN IF NOT EXISTS sugestao_plano_contas_id UUID REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sugestao_centro_custo_id UUID REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sugestao_origem          TEXT,
  ADD COLUMN IF NOT EXISTS sugestao_confianca       NUMERIC,
  ADD COLUMN IF NOT EXISTS sugestao_explicacao      TEXT,
  ADD COLUMN IF NOT EXISTS enviada_financeiro_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviada_financeiro_por   UUID,
  ADD COLUMN IF NOT EXISTS lancada_em               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lancada_por              UUID,
  ADD COLUMN IF NOT EXISTS transacao_id             UUID REFERENCES public.fin_transacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejeitada_motivo         TEXT;

-- ── 3. CHECK do status (idempotente) ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.log_notas_fiscais'::regclass
      AND conname = 'log_notas_fiscais_status_check'
  ) THEN
    ALTER TABLE public.log_notas_fiscais
      ADD CONSTRAINT log_notas_fiscais_status_check
      CHECK (status IN ('registrada', 'enviada_financeiro', 'lancada', 'rejeitada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_log_notas_fiscais_status
  ON public.log_notas_fiscais (status);
CREATE INDEX IF NOT EXISTS idx_log_notas_fiscais_emitente_cnpj
  ON public.log_notas_fiscais (emitente_cnpj) WHERE emitente_cnpj IS NOT NULL;

COMMENT ON COLUMN public.log_notas_fiscais.status IS
  'registrada (compras revisa) → enviada_financeiro (fila do financeiro) → lancada (virou fin_transacoes) | rejeitada (volta pra compras)';
COMMENT ON COLUMN public.log_notas_fiscais.extracao_raw IS
  'JSON bruto devolvido pela IA na extração do documento (auditoria)';
