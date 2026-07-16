-- ============================================================================
-- Compras ≤ R$ 1.000 · direto pra cotação (decisão do Matheus · 2026-07-15)
-- ============================================================================
-- Regra nova (implementada no backend · solicitacoes.js): compra com valor
-- estimado até R$ 1.000 dispensa aprovação de origem, carimbo de Gestão e
-- mérito, e nasce direto em 'em_cotacao' (fila da logística/Amaury). Após a
-- cotação, o fluxo existente segue: registrar-cotacao → aprovação financeira
-- (Yago decide sobre o valor COTADO).
--
-- Esta migration tem 2 partes:
--   1 · BACKFILL: move as compras ≤ R$ 1.000 que já estavam presas nos portões
--       (aguardando_aprovacao_origem / aguardando_merito) pra 'em_cotacao',
--       carimbando origem/Gestão como dispensadas com o motivo da regra.
--       Não toca em: já cotadas (valor_cotado preenchido), sobrestadas,
--       aguardando_ajuste, deletadas, nem em compras sem valor (fail-closed).
--   2 · AUDIT: acrescenta valor_estimado/valor_cotado (+ campos do portão
--       financeiro) às colunas auditadas do trg_audit_solicitacoes — o valor é
--       o eixo da regra de dispensa e não estava no audit log imutável
--       (achado da revisão de controles · 2026-07-15).
--
-- Idempotente (re-rodar não altera nada além do já alterado). Sem DDL de
-- schema — o código em produção NÃO depende desta migration pra funcionar.
-- ============================================================================

BEGIN;

-- 1 · Backfill · compras ≤ R$ 1.000 presas nos portões → em_cotacao
UPDATE public.solicitacoes
   SET status = 'em_cotacao',
       aprovacao_origem_status = CASE
         WHEN aprovacao_origem_status IN ('pendente', 'triagem') THEN 'dispensada'
         ELSE aprovacao_origem_status END,
       aprovacao_origem_motivo = CASE
         WHEN aprovacao_origem_status IN ('pendente', 'triagem')
           THEN 'Compra de até R$ 1.000 · direto para cotação'
         ELSE aprovacao_origem_motivo END,
       aprovacao_origem_em = CASE
         WHEN aprovacao_origem_status IN ('pendente', 'triagem') THEN now()
         ELSE aprovacao_origem_em END,
       aprovacao_gestao_status = CASE
         WHEN aprovacao_gestao_status = 'pendente' THEN 'dispensada'
         ELSE aprovacao_gestao_status END,
       aprovacao_gestao_motivo = CASE
         WHEN aprovacao_gestao_status = 'pendente'
           THEN 'Compra de até R$ 1.000 · direto para cotação'
         ELSE aprovacao_gestao_motivo END,
       aprovacao_gestao_em = CASE
         WHEN aprovacao_gestao_status = 'pendente' THEN now()
         ELSE aprovacao_gestao_em END,
       merito_status = NULL,
       precisa_aprovacao_financeira = true,
       updated_at = now()
 WHERE categoria = 'compras'
   AND deleted_at IS NULL
   AND status IN ('aguardando_aprovacao_origem', 'aguardando_merito')
   AND valor_cotado IS NULL
   AND valor_estimado > 0
   AND valor_estimado <= 1000;

-- 2 · Audit · valor entra no audit log imutável (recria o trigger com a lista
--     ampliada · mesma função audit_log_changes; base = 20260702150000).
DROP TRIGGER IF EXISTS trg_audit_solicitacoes ON public.solicitacoes;
CREATE TRIGGER trg_audit_solicitacoes
AFTER INSERT OR UPDATE OR DELETE ON public.solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'aprovacao_origem_diretor_id,aprovacao_origem_status,aprovacao_origem_motivo,urgencia_decisao,urgencia_motivo_recusa,status,deleted_at,nps_nota,eh_planejado,aprovacao_gestao_status,merito_status,merito_por,sobrestada_em,valor_estimado,valor_cotado,precisa_aprovacao_financeira,aprovado_financeiro_por'
);

COMMIT;

-- Verificação (rodar à parte, opcional):
-- a) quantas foram movidas:
--    SELECT count(*) FROM public.solicitacoes
--     WHERE categoria='compras' AND status='em_cotacao'
--       AND aprovacao_origem_motivo = 'Compra de até R$ 1.000 · direto para cotação';
-- b) compras ≤1000 que ficaram FORA de propósito (sobrestada/ajuste · revisar à mão):
--    SELECT id, titulo, status, valor_estimado FROM public.solicitacoes
--     WHERE categoria='compras' AND deleted_at IS NULL
--       AND valor_estimado > 0 AND valor_estimado <= 1000
--       AND status IN ('sobrestada', 'aguardando_ajuste');
