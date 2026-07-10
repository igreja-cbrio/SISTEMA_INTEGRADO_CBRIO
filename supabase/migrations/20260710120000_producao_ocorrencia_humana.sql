-- ============================================================================
-- Produção · ocorrência "Falha humana" + rótulo "Falha de equipamento"
-- ============================================================================
-- Pedro (2026-07-10): a opção "Falha técnica" passa a se chamar "Falha de
-- equipamento" (só o RÓTULO exibido · o slug `tecnica` continua estável como
-- identificador) e entra uma terceira categoria "Falha humana" (slug `humana`).
--
-- Aditiva e idempotente. NÃO recria `kpi_calcular_valor_auto` (função grande,
-- já evoluída por migrations posteriores · CREATE OR REPLACE aqui regrediria
-- outros ramos): o KPI PROD-CULTO-FALHAS segue medindo `producao.falhas_total`
-- (= ocorrências `tecnica` = falhas de equipamento) e é apenas RENOMEADO pra
-- refletir isso. As falhas humanas são acompanhadas na aba Detalhado da tela
-- (coluna "Humanas"), sem entrar na cascata OKR.
-- ============================================================================

-- 1. Amplia o CHECK do tipo de ocorrência pra aceitar 'humana'
ALTER TABLE public.culto_producao_ocorrencias
  DROP CONSTRAINT IF EXISTS culto_producao_ocorrencias_tipo_check;
ALTER TABLE public.culto_producao_ocorrencias
  ADD CONSTRAINT culto_producao_ocorrencias_tipo_check
  CHECK (tipo IN ('tecnica', 'humana', 'estrutura'));

-- 2. Renomeia o KPI de falhas pra "de equipamento" (a opção `tecnica` virou
--    "Falha de equipamento"). Continua medindo producao.falhas_total = tecnica.
UPDATE public.kpi_indicadores_taticos
   SET indicador = 'Falhas de equipamento · Produção',
       descricao = 'Número de ocorrências de falha de equipamento registradas nos cultos do mês'
 WHERE id = 'PROD-CULTO-FALHAS';
