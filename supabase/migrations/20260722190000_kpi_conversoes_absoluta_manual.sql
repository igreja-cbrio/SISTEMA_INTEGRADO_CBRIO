-- KPIs de conversão/aceitação dos cultos: mesma correção da frequência (Matheus
-- 2026-07-22). Antes delta_pct com meta absoluta → AMI 9756%, etc. O coletor
-- cultos.*_conv grava o nº absoluto de decisões/semana; 'manual' faz a view usar
-- esse valor vs meta absoluta.
UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'manual'
 WHERE id IN ('AMI-02','BRG-02','KIDS-02','ONL-13','SED-18');

-- BRG-02 estava sem meta absoluta (caía no 30 residual). Placeholder ~1/semana.
UPDATE public.kpi_indicadores_taticos SET meta_valor_absoluto = 52 WHERE id = 'BRG-02';
