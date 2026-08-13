-- GEN-05 "Valor total arrecadado no ciclo": liga o coletor à fonte viva do
-- balanço (vw_doacoes_unificada · dízimo+oferta+demais doações do fin_transacoes,
-- classificado por código de plano de contas), alimentado toda semana pelo
-- financeiro. Antes: sem fonte_auto → KPI vazio → falso "não preenchido".
-- O coletor 'generosidade.valor_total' vive em backend/services/kpiAutoCollector.js.
-- Idempotente / backwards-compatible.
UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'generosidade.valor_total'
 WHERE id = 'GEN-05' AND fonte_auto IS NULL;
