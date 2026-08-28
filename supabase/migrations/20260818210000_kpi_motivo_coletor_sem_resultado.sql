-- ============================================================================
-- KPI · "nunca calculado" com coletor NÃO é defeito técnico
--
-- Refino de `vw_kpi_sem_valor_motivo` (20260818190000). Ao conferir os 4 KPIs
-- que caíam em `nunca_calculado` — `cuidados.batismo_90d_pct` e
-- `cuidados.next_90d_pct` das áreas **bridge** e **online** — o motivo real
-- apareceu no dado: `cui_convertidos` tem **424 convertidos na sede, 1 no online
-- e ZERO em AMI e Bridge**. O coletor roda todo dia, não encontra coorte e não
-- grava linha. Chamar isso de "nunca calculado · técnico" manda a equipe caçar
-- um cron que está funcionando.
--
-- ⚠️ A distinção que fica: KPI **com** `fonte_auto` e sem nenhuma linha é
-- `coletor_sem_resultado` — na esmagadora maioria, ausência de base no período.
-- ⚠️ Isso NÃO é permissão pra ignorar: **família inteira de `fonte_auto` sem
-- resultado** (todos os `cultos.*`, todos os `cuidados.*`) continua sendo cron
-- quebrado, e é assim que o `kpi-auditor` já agrupa. Um KPI isolado é ausência
-- de coorte; a família toda é defeito.
--
-- `nunca_calculado` fica reservado a quem NÃO tem fonte automática nenhuma e
-- mesmo assim nunca produziu linha — aí sim é configuração/roteamento.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_kpi_sem_valor_motivo AS
WITH ultima_calculada AS (
  -- ⚠️ SEM filtro de valor, de propósito: é justamente a linha DESCARTADA pela
  -- trajetória (valor nulo ou zero no período aberto) que carrega o motivo.
  SELECT DISTINCT ON (c.kpi_id)
         c.kpi_id, c.periodo_referencia, c.valor_calculado, c.detalhes, c.calculado_em
    FROM public.kpi_valores_calculados c
   ORDER BY c.kpi_id, c.periodo_referencia DESC, c.calculado_em DESC
)
SELECT
  k.id AS kpi_id,
  k.indicador,
  k.area,
  k.periodicidade,
  k.tipo_calculo,
  coalesce(k.formula_config->>'fonte',
           k.formula_config->>'dado_tipo',
           k.formula_config->>'numerador',
           k.fonte_auto) AS fonte,
  u.periodo_referencia AS ultimo_periodo_calculado,
  u.calculado_em,
  -- O número que EXISTE no período, quando existe. É o que permite dizer
  -- "o dado está lá, quem não fecha é a fórmula".
  coalesce(u.detalhes->>'atual', u.detalhes->>'valor', u.detalhes->>'numerador') AS dado_atual,
  u.detalhes->>'anterior' AS dado_anterior,
  u.detalhes->>'denominador' AS dado_denominador,
  CASE
    WHEN u.kpi_id IS NULL AND k.fonte_auto IS NOT NULL THEN 'coletor_sem_resultado'
    WHEN u.kpi_id IS NULL THEN 'nunca_calculado'
    WHEN k.formula_config->>'fonte' = 'solicitacoes' THEN 'sem_demanda'
    WHEN k.tipo_calculo = 'razao'
         AND coalesce((u.detalhes->>'denominador')::numeric, 0) = 0 THEN 'sem_demanda'
    WHEN k.tipo_calculo IN ('delta_pct', 'delta_abs')
         AND coalesce((u.detalhes->>'atual')::numeric, 0) > 0
         AND coalesce((u.detalhes->>'anterior')::numeric, 0) = 0 THEN 'base_zero'
    WHEN k.tipo_calculo IN ('delta_pct', 'delta_abs')
         AND coalesce((u.detalhes->>'atual')::numeric, 0) = 0 THEN 'sem_registro'
    WHEN u.valor_calculado IS NULL THEN 'sem_registro'
    WHEN u.periodo_referencia >= public._kpi_periodo_corrente(k.periodicidade) THEN 'periodo_aberto'
    ELSE 'indefinido'
  END AS motivo
FROM public.kpi_indicadores_taticos k
JOIN public.vw_kpi_trajetoria_atual v ON v.kpi_id = k.id
LEFT JOIN ultima_calculada u ON u.kpi_id = k.id
WHERE k.ativo = true
  AND k.deleted_at IS NULL
  AND v.ultimo_valor IS NULL;

COMMENT ON VIEW public.vw_kpi_sem_valor_motivo IS
  'Por que cada KPI ativo esta sem valor: sem_demanda (denominador ZERO - o fato e a ausencia) | sem_registro (a operacao existe e nao e registrada) | base_zero (TEM dado no periodo, em dado_atual; a formula e variacao sobre zero) | coletor_sem_resultado (tem fonte_auto e o coletor nao achou base - familia INTEIRA sem resultado e que e cron quebrado) | nunca_calculado (sem fonte automatica e sem linha - configuracao) | periodo_aberto. Existe para o relatorio semanal parar de chamar tudo de "sem lancamento": o encaminhamento de cada motivo e diferente.';

GRANT SELECT ON public.vw_kpi_sem_valor_motivo TO authenticated;
