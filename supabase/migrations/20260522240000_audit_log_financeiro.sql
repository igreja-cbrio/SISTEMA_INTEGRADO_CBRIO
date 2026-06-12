-- Audit log financeiro · triggers em 5 tabelas criticas
-- 2026-05-22 · usa funcao genérica audit_log_changes() ja existente

DROP TRIGGER IF EXISTS trg_audit_fin_transacoes ON public.fin_transacoes;
CREATE TRIGGER trg_audit_fin_transacoes
AFTER INSERT OR UPDATE OR DELETE ON public.fin_transacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'valor,tipo,data_competencia,plano_contas_id,centro_custo_id,status,conta_id'
);

DROP TRIGGER IF EXISTS trg_audit_fin_contas ON public.fin_contas;
CREATE TRIGGER trg_audit_fin_contas
AFTER INSERT OR UPDATE OR DELETE ON public.fin_contas
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'saldo,ativa,banco,agencia,conta'
);

DROP TRIGGER IF EXISTS trg_audit_fin_contas_pagar ON public.fin_contas_pagar;
CREATE TRIGGER trg_audit_fin_contas_pagar
AFTER INSERT OR UPDATE OR DELETE ON public.fin_contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'valor,data_vencimento,data_pagamento,status,categoria_id,fornecedor'
);

DROP TRIGGER IF EXISTS trg_audit_fin_closing_mensal ON public.fin_closing_mensal;
CREATE TRIGGER trg_audit_fin_closing_mensal
AFTER INSERT OR UPDATE OR DELETE ON public.fin_closing_mensal
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_fin_despesas_recorrentes ON public.fin_despesas_recorrentes;
CREATE TRIGGER trg_audit_fin_despesas_recorrentes
AFTER INSERT OR UPDATE OR DELETE ON public.fin_despesas_recorrentes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'descricao,valor_medio,cadencia_dias,dia_vencimento,ativa,confirmada,plano_contas_id'
);

COMMIT;
