-- Compra pequena executa sem passar pelo financeiro (decisão do Matheus · 2026-08-12).
--
-- O QUE MUDA NA OPERAÇÃO. Hoje TODA compra/serviço vai para a fila do
-- coordenador financeiro depois da cotação, sem olhar valor — a alçada de
-- R$ 1.000 existia mas estava explicitamente fora de compras
-- (20260616160000, ramo `NEW.categoria IN ('compras','reembolso',...)`).
-- A partir daqui, quando a logística cota até R$ 1.000, a solicitação volta
-- para a própria logística executar (Amaury compra no cartão) e o financeiro é
-- apenas AVISADO. Acima disso, nada muda.
--
-- POR QUE COLUNA NOVA E NÃO REUSAR `aprovado_financeiro_em`. É tentador
-- carimbar a data de aprovação e seguir o fluxo existente — e seria uma
-- mentira gravada: diria que o financeiro aprovou uma compra que ele nunca
-- viu. Numa auditoria de gasto, "quem autorizou?" precisa ter resposta
-- honesta. Por isso a dispensa tem carimbo próprio.
--
-- ⚠️ `financeiro_dispensa_limite` guarda o teto QUE VALIA NAQUELE MOMENTO.
-- Sem ele, subir o limite no futuro reescreveria retroativamente a leitura de
-- todas as compras antigas ("essa passou porque o teto era 3 mil?" — não dá
-- pra saber). O teto é regra que muda; o registro é fato que não muda.
--
-- Sem PII (data, texto de regra e número). `solicitacoes` já está na whitelist
-- de soft-delete e no audit log — colunas aditivas não exigem nada disso.
-- Aditiva e idempotente: pode rodar duas vezes.

BEGIN;

ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS financeiro_dispensado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS financeiro_dispensa_motivo text,
  ADD COLUMN IF NOT EXISTS financeiro_dispensa_limite numeric;

COMMENT ON COLUMN public.solicitacoes.financeiro_dispensado_em IS
  'Quando a aprovação financeira foi DISPENSADA por valor (compra/serviço cotado dentro do teto). NUNCA preencher junto com aprovado_financeiro_em: aprovado = alguém aprovou; dispensado = ninguém precisou aprovar.';

COMMENT ON COLUMN public.solicitacoes.financeiro_dispensa_motivo IS
  'Texto humano da regra que dispensou o financeiro, gravado no momento da dispensa (backend/utils/alcadaCompra.js).';

COMMENT ON COLUMN public.solicitacoes.financeiro_dispensa_limite IS
  'Teto em reais vigente no momento da dispensa. Congelado de propósito: mudar a regra depois não pode reescrever a leitura das compras já executadas.';

-- Índice parcial: a fila "compras que a logística executou sem o financeiro" é
-- uma minoria das linhas, e é o recorte que o financeiro vai querer conferir em
-- bloco. Parcial pra não pesar a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_solicitacoes_financeiro_dispensado
  ON public.solicitacoes (financeiro_dispensado_em DESC)
  WHERE financeiro_dispensado_em IS NOT NULL AND deleted_at IS NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA (rodar depois, no catálogo — não confiar no "success: true"):
--
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'solicitacoes'
--    and column_name like 'financeiro_dispensa%'
--  order by column_name;
--   -> esperado: 3 linhas (financeiro_dispensa_limite numeric,
--      financeiro_dispensa_motivo text, financeiro_dispensado_em timestamptz)
--
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'solicitacoes'
--    and indexname = 'idx_solicitacoes_financeiro_dispensado';
--   -> esperado: 1 linha
--
-- Invariante que NUNCA pode aparecer (aprovado E dispensado ao mesmo tempo):
-- select count(*) from public.solicitacoes
--  where aprovado_financeiro_em is not null and financeiro_dispensado_em is not null;
--   -> esperado: 0
-- ─────────────────────────────────────────────────────────────────────────────
