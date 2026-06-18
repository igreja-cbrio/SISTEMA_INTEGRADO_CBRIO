-- ============================================================================
-- Logística · Estoque (Fase 3a) · catálogo + razão (saldo DERIVADO) + validade
-- ============================================================================
-- Substitui o controle de estoque que hoje vive num Power App + 2 listas
-- SharePoint (site GestaodeEstoque). Decisões com o Marcos (2026-06-15):
--   - Saldo NÃO é coluna editável · é DERIVADO do razão (entrada + / saída − /
--     ajuste = delta com sinal). Nunca "mente". (vw_log_estoque_saldo)
--   - Produtos entram SEM quantidade (saldo=0) · a igreja faz o inventário
--     físico e lança como os primeiros movimentos no sistema.
--   - Validade por LOTE: cada entrada de perecível leva uma validade; quando os
--     vencimentos diferem viram vários lotes (até lote de 1 un). Consumo FEFO
--     (calculado na leitura · ver backend). Só perecíveis ligam (controla_validade).
--   - Consumo por área/evento: a saída carrega area_destino + evento_id.
--   - Convenção do módulo Logística = flag `ativo` (igual log_fornecedores),
--     NÃO deleted_at · ledger é append-only (correção via 'ajuste').
-- Acesso 100% pelo backend (service_role). RLS defensiva por módulo logística.
-- Idempotente. Atômica. Não-destrutiva.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catálogo de produtos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.log_estoque_produtos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  categoria         text,          -- Limpeza/Descartáveis/Alimentos/Bebidas/Papelaria/Infra/Ministerial/Livraria
  subtipo_infra     text,          -- Elétrico/Hidráulico/Pintura/Refrigeração/Mat. Const./Ferramenta (só Infra)
  unidade           text,          -- un/caixa/pacote/litro/kg (opcional · hoje embutido no nome)
  valor_unitario    numeric(12,2) NOT NULL DEFAULT 0,
  quantidade_minima numeric NOT NULL DEFAULT 0,
  controla_validade boolean NOT NULL DEFAULT false,  -- perecível → entradas pedem validade
  ativo             boolean NOT NULL DEFAULT true,
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- nome único (case/space-insensitive) · habilita o ON CONFLICT do seed idempotente
CREATE UNIQUE INDEX IF NOT EXISTS uq_log_estoque_produtos_nome
  ON public.log_estoque_produtos (lower(btrim(nome)));
CREATE INDEX IF NOT EXISTS idx_log_estoque_produtos_cat
  ON public.log_estoque_produtos (categoria) WHERE ativo;

-- ----------------------------------------------------------------------------
-- 2. Razão de movimentações (fonte do saldo · append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.log_estoque_movimentacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id            uuid NOT NULL REFERENCES public.log_estoque_produtos(id) ON DELETE RESTRICT,
  tipo                  text NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
  quantidade            numeric NOT NULL CHECK (quantidade <> 0),  -- entrada/saída: magnitude>0 · ajuste: delta com sinal
  validade              date,        -- lote (entrada/ajuste+ de perecível)
  data_movimentacao     date NOT NULL DEFAULT current_date,
  area_destino          text,        -- saída: Kids/Recepção/Culto/Manutenção/... (consumo por área)
  evento_id             uuid,        -- saída ligada a um evento (consumo por evento · sem FK rígida)
  motivo                text,
  origem_solicitacao_id uuid,        -- ponte: saída que atende uma solicitação (Fase 3a-2)
  feito_por             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
-- entrada/saída têm magnitude positiva · ajuste pode ser delta com sinal
ALTER TABLE public.log_estoque_movimentacoes DROP CONSTRAINT IF EXISTS chk_estoque_mov_sinal;
ALTER TABLE public.log_estoque_movimentacoes ADD CONSTRAINT chk_estoque_mov_sinal
  CHECK ((tipo IN ('entrada','saida') AND quantidade > 0) OR tipo = 'ajuste');

CREATE INDEX IF NOT EXISTS idx_log_estoque_mov_prod
  ON public.log_estoque_movimentacoes (produto_id, data_movimentacao DESC);
CREATE INDEX IF NOT EXISTS idx_log_estoque_mov_validade
  ON public.log_estoque_movimentacoes (produto_id, validade)
  WHERE tipo IN ('entrada','ajuste') AND validade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_log_estoque_mov_area
  ON public.log_estoque_movimentacoes (area_destino, data_movimentacao DESC)
  WHERE tipo = 'saida';

-- ----------------------------------------------------------------------------
-- 3. View de SALDO (derivado do razão)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_log_estoque_saldo AS
SELECT
  p.id, p.nome, p.categoria, p.subtipo_infra, p.unidade, p.valor_unitario,
  p.quantidade_minima, p.controla_validade, p.ativo, p.observacoes,
  p.created_at, p.updated_at,
  COALESCE(s.saldo, 0)                                         AS saldo,
  ROUND(COALESCE(s.saldo, 0) * p.valor_unitario, 2)            AS valor_total,
  (p.quantidade_minima > 0 AND COALESCE(s.saldo, 0) <= p.quantidade_minima) AS precisa_repor
FROM public.log_estoque_produtos p
LEFT JOIN (
  SELECT produto_id,
         SUM(CASE WHEN tipo = 'saida' THEN -quantidade ELSE quantidade END) AS saldo
    FROM public.log_estoque_movimentacoes
   GROUP BY produto_id
) s ON s.produto_id = p.id;

GRANT SELECT ON public.vw_log_estoque_saldo TO authenticated, service_role;
COMMENT ON VIEW public.vw_log_estoque_saldo IS
  'Produtos de estoque com saldo DERIVADO do razão (log_estoque_movimentacoes). Fase 3a.';

-- ----------------------------------------------------------------------------
-- 4. updated_at automático no produto
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_log_estoque_prod_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_log_estoque_prod_updated ON public.log_estoque_produtos;
CREATE TRIGGER trg_log_estoque_prod_updated
  BEFORE UPDATE ON public.log_estoque_produtos
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_estoque_prod_updated();

-- ----------------------------------------------------------------------------
-- 5. RLS · acesso real é via backend (service_role) · leitura defensiva por módulo
-- ----------------------------------------------------------------------------
ALTER TABLE public.log_estoque_produtos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS log_estoque_prod_sel ON public.log_estoque_produtos;
CREATE POLICY log_estoque_prod_sel ON public.log_estoque_produtos
  FOR SELECT TO authenticated USING (public.current_user_module_level('logistica') >= 1);
DROP POLICY IF EXISTS log_estoque_prod_srv ON public.log_estoque_produtos;
CREATE POLICY log_estoque_prod_srv ON public.log_estoque_produtos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS log_estoque_mov_sel ON public.log_estoque_movimentacoes;
CREATE POLICY log_estoque_mov_sel ON public.log_estoque_movimentacoes
  FOR SELECT TO authenticated USING (public.current_user_module_level('logistica') >= 1);
DROP POLICY IF EXISTS log_estoque_mov_srv ON public.log_estoque_movimentacoes;
CREATE POLICY log_estoque_mov_srv ON public.log_estoque_movimentacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
