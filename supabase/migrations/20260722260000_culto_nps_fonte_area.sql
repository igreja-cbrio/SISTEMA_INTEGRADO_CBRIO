-- NPS dos cultos por área · liga os KPIs CULTO-NPS-* aos NPS de área que já
-- existem (decisão do Matheus: usar as respostas que temos, sem alterar o NPS).
--
-- Antes: CULTO-NPS-AMI/BRIDGE/KIDS/ONLINE/SEDE tinham fonte_auto=NULL, tipo
-- delta_abs, dado_tipo='nps_culto' — e não há nenhuma pesquisa 'nps_culto' →
-- mostravam "—".
--
-- Agora: fonte_auto='nps.culto_area' (coletor novo em kpiAutoCollector.js) que
-- devolve a MÉDIA das notas (0-10) das respostas da pesquisa de NPS geral
-- (contexto_kpi='nps_geral') daquela área. tipo_calculo='manual' (o valor do
-- coletor vira o valor do KPI · mostra o NÍVEL do NPS, não um delta).
--
-- meta_valor=9 (escala 0-10) fica. meta_valor_absoluto=90 é ANULADO: com ele a
-- view normaliza por periodicidade (mensal ÷12 = 7,5) e o semáforo nasceria
-- errado; sem ele a view usa meta_valor=9 direto.
--
-- Área sem pesquisa de NPS geral (hoje só AMI tem: "Pesquisa da Juventude", 60
-- respostas) segue "—" — dado real ausente, não bug.
--
-- Idempotente. Após aplicar: recoletar (POST /api/kpis/v2/coletar
-- {"fontes":["nps."]} ou cron diário) pra materializar os valores.

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'nps.culto_area',
       tipo_calculo = 'manual',
       meta_valor_absoluto = NULL,
       updated_at = now()
 WHERE id LIKE 'CULTO-NPS-%';
