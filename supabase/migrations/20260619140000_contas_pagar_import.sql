-- Contas a Pagar · importação da planilha externa (Toscano) + base pro cruzamento
--
-- Contexto (pedido da gestão · 2026-06-19): a igreja mantém o "contas a pagar"
-- num sistema financeiro externo (export "Cp_Toscano.xlsx" · baixadas + não
-- baixadas, por ano). Esta leva (Fase 1) traz esses títulos pro ERP, reusando a
-- tabela `fin_contas_pagar` (que existia mas estava VAZIA · só cabeada pro
-- agendamento Santander). A aba "Contas a Pagar" do /financeiro-v2 passa a
-- mostrar os títulos importados.
--
-- A Fase 2 (cruzamento) usa `fin_transacao_id`/`vinculo_status` pra amarrar cada
-- parcela BAIXADA com a SAÍDA correspondente no balanço (`fin_transacoes`
-- despesa · ~26 mil linhas 2022-2026). Por isso já materializamos
-- `plano_contas_id` + `centro_custo_id` (a planilha usa os MESMOS códigos do
-- `fin_plano_contas`/`fin_centros_custo` · batem 1:1) — o cruzamento fica forte.
--
-- Migration ADITIVA + idempotente. Empréstimos entram como conta a pagar normal
-- (são passivo a pagar) — a regra contábil "empréstimo não é receita" vale só
-- pra agregações de RECEITA, não pra contas a pagar.

-- ── 1. Colunas novas (aditivas) ─────────────────────────────────────
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS codigo_origem       BIGINT,                 -- "Código" no sistema de origem (Toscano)
  ADD COLUMN IF NOT EXISTS origem              TEXT,                   -- ex: 'toscano'
  ADD COLUMN IF NOT EXISTS ano                 INTEGER,                -- ano do vencimento (recorte da planilha)
  ADD COLUMN IF NOT EXISTS plano_contas_id     UUID REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS centro_custo_id     UUID REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plano_contas_codigo TEXT,                   -- código cru da planilha (fallback histórico)
  ADD COLUMN IF NOT EXISTS plano_contas_nome   TEXT,
  ADD COLUMN IF NOT EXISTS centro_custo_codigo TEXT,
  ADD COLUMN IF NOT EXISTS centro_custo_nome   TEXT,
  ADD COLUMN IF NOT EXISTS historico           TEXT,
  ADD COLUMN IF NOT EXISTS grupo_movimento     TEXT,                   -- Custo Fixo | Variável - Recorrente | Obra - ...
  ADD COLUMN IF NOT EXISTS numero_documento    TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento     TEXT,
  ADD COLUMN IF NOT EXISTS conta_caixa         TEXT,                   -- "ContaCaixa" da planilha (ITAU/CAIXA/...)
  ADD COLUMN IF NOT EXISTS planejada           BOOLEAN,
  ADD COLUMN IF NOT EXISTS pago_cartao         BOOLEAN,
  ADD COLUMN IF NOT EXISTS juros               NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS mora                NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS multa               NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS desconto            NUMERIC(18,2),
  -- Vínculo com a saída do balanço (Fase 2 · cruzamento fiscal)
  ADD COLUMN IF NOT EXISTS fin_transacao_id    UUID REFERENCES public.fin_transacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vinculo_status      TEXT NOT NULL DEFAULT 'nao_vinculada',  -- nao_vinculada | sugerida | confirmada
  ADD COLUMN IF NOT EXISTS vinculo_score       NUMERIC,
  ADD COLUMN IF NOT EXISTS vinculo_em          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vinculo_por         UUID,
  -- Importação idempotente + soft-delete (padrão de segurança da casa)
  ADD COLUMN IF NOT EXISTS import_chave        TEXT,                   -- ex: 'toscano:23686'
  ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ;

-- import_chave única (idempotência da importação · reimportar não duplica).
-- Índice NÃO-parcial: múltiplos NULL são permitidos (linhas manuais sem chave
-- coexistem) e o ON CONFLICT do upsert infere o índice corretamente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_contas_pagar_import_chave
  ON public.fin_contas_pagar (import_chave);

-- ── 2. Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_active
  ON public.fin_contas_pagar (data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_status
  ON public.fin_contas_pagar (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_ano
  ON public.fin_contas_pagar (ano) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_valor_data
  ON public.fin_contas_pagar (valor, data_pagamento) WHERE deleted_at IS NULL;  -- Fase 2 (cruzamento)
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_plano
  ON public.fin_contas_pagar (plano_contas_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_centro
  ON public.fin_contas_pagar (centro_custo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_transacao
  ON public.fin_contas_pagar (fin_transacao_id) WHERE fin_transacao_id IS NOT NULL;

-- ── 3. updated_at automático ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_fin_contas_pagar_updated ON public.fin_contas_pagar;
CREATE TRIGGER trg_fin_contas_pagar_updated
  BEFORE UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Soft-delete whitelist (anexa lendo a lista viva · não dropa nada) ──
DO $$
DECLARE arr text[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO arr;
  IF NOT ('fin_contas_pagar' = ANY(arr)) THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::text[] $f$',
      arr || ARRAY['fin_contas_pagar']
    );
  END IF;
END $$;

-- ── 5. RLS contextual por módulo financeiro (substitui a policy legada) ──
ALTER TABLE public.fin_contas_pagar ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='fin_contas_pagar' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fin_contas_pagar', p.policyname);
  END LOOP;
END $$;

CREATE POLICY fin_contas_pagar_select ON public.fin_contas_pagar
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('financeiro') >= 1);

CREATE POLICY fin_contas_pagar_insert ON public.fin_contas_pagar
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('financeiro') >= 3);

CREATE POLICY fin_contas_pagar_update ON public.fin_contas_pagar
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('financeiro') >= 3)
  WITH CHECK (public.current_user_module_level('financeiro') >= 3);

CREATE POLICY fin_contas_pagar_delete ON public.fin_contas_pagar
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY fin_contas_pagar_service ON public.fin_contas_pagar
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. Audit log (mudanças sensíveis) ───────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_fin_contas_pagar ON public.fin_contas_pagar;
CREATE TRIGGER trg_audit_fin_contas_pagar
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('valor,status,data_pagamento,data_vencimento,fornecedor,fin_transacao_id,deleted_at');

-- ── 7. Resumo agregado (evita o cap de 1000 do PostgREST nos KPIs) ──
CREATE OR REPLACE FUNCTION public.fn_contas_pagar_resumo(
  p_ano        INTEGER DEFAULT NULL,
  p_status     TEXT    DEFAULT NULL,
  p_fornecedor TEXT    DEFAULT NULL,
  p_plano      UUID    DEFAULT NULL,
  p_centro     UUID    DEFAULT NULL,
  p_busca      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT cp.valor, cp.status, cp.data_vencimento
      FROM public.fin_contas_pagar cp
     WHERE cp.deleted_at IS NULL
       AND (p_ano        IS NULL OR cp.ano = p_ano)
       AND (p_status     IS NULL OR cp.status = p_status)
       AND (p_plano      IS NULL OR cp.plano_contas_id = p_plano)
       AND (p_centro     IS NULL OR cp.centro_custo_id = p_centro)
       AND (p_fornecedor IS NULL OR cp.fornecedor ILIKE '%'||p_fornecedor||'%')
       AND (p_busca      IS NULL OR cp.descricao ILIKE '%'||p_busca||'%'
                                 OR cp.historico ILIKE '%'||p_busca||'%'
                                 OR cp.fornecedor ILIKE '%'||p_busca||'%')
  )
  SELECT jsonb_build_object(
    'total_n',        count(*),
    'total_valor',    coalesce(sum(valor), 0),
    'baixadas_n',     count(*) FILTER (WHERE status = 'pago'),
    'baixadas_valor', coalesce(sum(valor) FILTER (WHERE status = 'pago'), 0),
    'abertas_n',      count(*) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado'),
    'abertas_valor',  coalesce(sum(valor) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado'), 0),
    'vencidas_n',     count(*) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado' AND data_vencimento < current_date),
    'vencidas_valor', coalesce(sum(valor) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado' AND data_vencimento < current_date), 0),
    'anos', (SELECT coalesce(jsonb_agg(a ORDER BY a DESC), '[]'::jsonb)
               FROM (SELECT DISTINCT ano AS a FROM public.fin_contas_pagar
                      WHERE deleted_at IS NULL AND ano IS NOT NULL) y)
  )
  FROM base;
$$;

-- ── 8. Comentários ──────────────────────────────────────────────────
COMMENT ON COLUMN public.fin_contas_pagar.codigo_origem IS
  'ID do título no sistema financeiro de origem (ex: "Código" da planilha Toscano). Base do import_chave.';
COMMENT ON COLUMN public.fin_contas_pagar.fin_transacao_id IS
  'Saída do balanço (fin_transacoes despesa) vinculada na conciliação da Fase 2. NULL = ainda não cruzada.';
COMMENT ON COLUMN public.fin_contas_pagar.status IS
  'pendente (em aberto) | pago (baixada) | cancelado | vencido. Importação: Baixa preenchida → pago; vazia → pendente.';

NOTIFY pgrst, 'reload schema';
