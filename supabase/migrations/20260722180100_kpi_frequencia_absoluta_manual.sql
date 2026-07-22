-- KPIs de frequência dos cultos: passam a medir FREQUÊNCIA ABSOLUTA vs meta
-- (decisão do Matheus 2026-07-22). Antes: tipo_calculo='delta_pct' (% crescimento)
-- com meta ABSOLUTA cascateada → resultados sem sentido (Sede 0%, Online 5110%).
-- O coletor cultos.*_freq já grava a frequência absoluta semanal em kpi_registros;
-- 'manual' faz a view usar esse valor contra a meta absoluta. A variação semana-a-
-- semana é mostrada no popup (calculada dos dois valores absolutos).
UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'manual'
 WHERE id IN ('AMI-01','BRG-01','KIDS-01','ONL-11','SED-21');

-- BRG e ONL estavam sem meta absoluta (caíam no 30 residual → Online dava 5110%).
-- Meta = média semanal real de 2026 × 1,3 (mesma lógica do cascade), em escala ANUAL.
UPDATE public.kpi_indicadores_taticos SET meta_valor_absoluto = 2805   WHERE id = 'BRG-01';
UPDATE public.kpi_indicadores_taticos SET meta_valor_absoluto = 106022 WHERE id = 'ONL-11';
