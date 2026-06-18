-- Compras (Logística · aba Compras) · ledger do Pery + scan IA + vínculo fiscal
--
-- Substitui a planilha manual "CONTROLE DE COMPRAS FIXOS E VARIÁVEIS" que o
-- Pery alimentava à mão. Cada linha é uma COMPRA (não uma nota fiscal — a nota
-- é o comprovante opcional). Fluxo novo:
--   1. Importação da planilha (502 compras 2026) → status_aprovacao='aprovada'.
--   2. Pery tira foto da nota → IA (nfScanner/Haiku) extrai os dados → a compra
--      nasce status_aprovacao='pendente' (fila de aprovação do PRÓPRIO Pery —
--      ele confere antes de virar lançamento; o sistema NUNCA lança sozinho).
--   3. Vínculo com a SAÍDA do balanço (fin_transacoes tipo='despesa', vinda das
--      planilhas de balanço importadas): sugestão por valor+data, confirmação
--      MANUAL. Serve pra quem faz os lançamentos cruzar a compra com a info
--      fiscal certinha. Nunca vincula automático.
--
-- NÃO cria fin_transacoes (esse é o fluxo da aba Notas Fiscais → financeiro).
-- Aqui a compra é o registro operacional do Pery e aponta pra saída que JÁ
-- existe no financeiro.

-- ── 1. Tabela ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.log_compras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Espelho da planilha
  tipo            TEXT,                       -- fixo | variavel | cartao (origem planilha)
  data_compra     DATE,
  n_pedido        TEXT,
  comprador       TEXT,                       -- Erivelton | Pery | Amaury | ... (label histórico)
  fornecedor      TEXT,                       -- razão/loja (texto livre da planilha)
  fornecedor_id   UUID REFERENCES public.log_fornecedores(id) ON DELETE SET NULL,
  materiais       TEXT,                       -- descrição do que foi comprado
  origem          TEXT,
  centro_custo    TEXT,                       -- coluna "TORRE" da planilha (ADM, MINISTERIAL, CAMPANHA...)
  centro_custo_id UUID REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  valor           NUMERIC(18,2),
  data_entrega    DATE,
  status_entrega  TEXT DEFAULT 'entregue',    -- entregue | pendente
  forma_pgto      TEXT,
  parcelas        INTEGER,

  -- Origem do registro + scan da nota
  origem_registro     TEXT NOT NULL DEFAULT 'manual',  -- planilha | scan | manual | mercadolivre
  storage_path        TEXT,                  -- foto/PDF da nota no bucket log-arquivos
  emitente_cnpj       TEXT,
  numero_nota         TEXT,
  extracao_raw        JSONB,                  -- JSON bruto da IA (auditoria)
  extracao_confianca  NUMERIC,

  -- Aprovação do Pery (review-before-apply)
  status_aprovacao  TEXT NOT NULL DEFAULT 'aprovada',  -- pendente | aprovada | rejeitada
  aprovada_em       TIMESTAMPTZ,
  aprovada_por      UUID,
  rejeitada_motivo  TEXT,

  -- Vínculo com a saída do balanço (cruzamento fiscal)
  fin_transacao_id  UUID REFERENCES public.fin_transacoes(id) ON DELETE SET NULL,
  vinculo_status    TEXT NOT NULL DEFAULT 'nao_vinculada',  -- nao_vinculada | sugerida | confirmada
  vinculo_score     NUMERIC,
  vinculo_em        TIMESTAMPTZ,
  vinculo_por       UUID,

  -- Importação idempotente
  import_chave      TEXT UNIQUE,             -- ex: planilha2026:fixos:7

  observacoes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  deleted_at    TIMESTAMPTZ
);

-- CHECKs (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'log_compras_status_aprovacao_check') THEN
    ALTER TABLE public.log_compras ADD CONSTRAINT log_compras_status_aprovacao_check
      CHECK (status_aprovacao IN ('pendente', 'aprovada', 'rejeitada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'log_compras_vinculo_status_check') THEN
    ALTER TABLE public.log_compras ADD CONSTRAINT log_compras_vinculo_status_check
      CHECK (vinculo_status IN ('nao_vinculada', 'sugerida', 'confirmada'));
  END IF;
END $$;

-- ── 2. Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_log_compras_active
  ON public.log_compras (data_compra DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_log_compras_aprovacao
  ON public.log_compras (status_aprovacao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_log_compras_vinculo
  ON public.log_compras (vinculo_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_log_compras_transacao
  ON public.log_compras (fin_transacao_id) WHERE fin_transacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_log_compras_valor_data
  ON public.log_compras (valor, data_compra) WHERE deleted_at IS NULL;

-- ── 3. updated_at automático ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_log_compras_updated ON public.log_compras;
CREATE TRIGGER trg_log_compras_updated
  BEFORE UPDATE ON public.log_compras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Soft-delete whitelist · anexa log_compras lendo a lista viva ──
-- (lê o array atual em tempo de aplicação e só acrescenta · não dropa nada)
DO $$
DECLARE arr text[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO arr;
  IF NOT ('log_compras' = ANY(arr)) THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::text[] $f$',
      arr || ARRAY['log_compras']
    );
  END IF;
END $$;

-- ── 5. RLS contextual por módulo logistica ──────────────────────────
ALTER TABLE public.log_compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS log_compras_select  ON public.log_compras;
DROP POLICY IF EXISTS log_compras_insert  ON public.log_compras;
DROP POLICY IF EXISTS log_compras_update  ON public.log_compras;
DROP POLICY IF EXISTS log_compras_delete  ON public.log_compras;
DROP POLICY IF EXISTS log_compras_service ON public.log_compras;

CREATE POLICY log_compras_select ON public.log_compras
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('logistica') >= 1);

CREATE POLICY log_compras_insert ON public.log_compras
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('logistica') >= 2);

CREATE POLICY log_compras_update ON public.log_compras
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('logistica') >= 2)
  WITH CHECK (public.current_user_module_level('logistica') >= 2);

CREATE POLICY log_compras_delete ON public.log_compras
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY log_compras_service ON public.log_compras
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. Comentários ──────────────────────────────────────────────────
COMMENT ON TABLE public.log_compras IS
  'Ledger de compras do Pery (aba Compras da Logística). Substitui a planilha manual. Scan da nota cai em fila de aprovação; vincula com a saída do balanço (fin_transacoes) pra cruzamento fiscal.';
COMMENT ON COLUMN public.log_compras.status_aprovacao IS
  'pendente (scan aguardando o Pery conferir) → aprovada (vira compra oficial) | rejeitada. Importação da planilha nasce aprovada.';
COMMENT ON COLUMN public.log_compras.fin_transacao_id IS
  'Saída do balanço (fin_transacoes despesa) vinculada MANUALMENTE pra cruzamento fiscal. NULL = ainda não cruzada.';
COMMENT ON COLUMN public.log_compras.centro_custo IS
  'Coluna TORRE da planilha (ADM/MINISTERIAL/CAMPANHA/INFRA/...). centro_custo_id liga ao fin_centros_custo quando resolvido.';
