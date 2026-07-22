-- Generosidade · reativa GEN-05 "Valor total arrecadado no ciclo".
--
-- Contexto: os KPIs de Generosidade com coletor (GEN-02/04/05) estavam
-- ativo=false (resíduo da triagem de KRs de 03/06 · migration 20260603230000),
-- então nem apareciam na vw_kpi_trajetoria_atual (WHERE ativo=true) nem eram
-- coletados pelo cron. Reativamos SÓ o GEN-05 (valor total), que agora puxa do
-- BALANÇO importado toda semana.
--
-- O coletor `generosidade.valor_total` (kpiAutoCollector.js) foi corrigido no
-- mesmo PR pra somar SÓ `fonte='fin_transacoes'` da vw_doacoes_unificada — antes
-- somava também o nominal (mem_contribuicoes), que é a MESMA verba já contida no
-- balanço agregado → dupla contagem (~R$ 1,5 mi inflado). Empréstimo fica fora
-- (o ramo fin_transacoes da view é escopado a 3.01% = dízimo/oferta).
--
-- meta_valor fica NULL de propósito: o Marcos define a meta no /gestao. A view
-- trata NULL como 'sem_meta' (mostra o valor, sem vermelho falso).
--
-- GEN-02 (recorrência) e GEN-04 seguem ativo=false por ora: dependem do dado
-- NOMINAL por membro (mem_contribuicoes), que hoje só existe até 16/06 (carga
-- única). Serão reativados quando a importação nominal recorrente entrar.
--
-- Idempotente. Não é destrutivo. Após aplicar: bust do cache de KPI e recoleta
-- (POST /api/kpis/v2/coletar {"fontes":["generosidade."]}) pra sobrescrever os
-- registros inflados; o cron diário também cobre.

UPDATE public.kpi_indicadores_taticos
   SET ativo = true,
       updated_at = now()
 WHERE id = 'GEN-05';
