-- ============================================================================
-- KPI · POR QUE este indicador está sem valor
--
-- Complemento da migration `20260818180000` (zero conta em período fechado).
-- Depois dela sobram 55 KPIs ativos sem valor — e eles NÃO são todos a mesma
-- coisa. O relatório semanal chamava todos de "sem lançamento", que é a leitura
-- errada em quase todos: ninguém está esperando alguém digitar.
--
-- ⚠️ VIEW NOVA, não alteração da `vw_kpi_trajetoria_atual`: aquela view é lida
-- pelo painel, pela matriz, pelos agentes e pelo relatório. Acrescentar régua
-- dentro dela obrigaria todo consumidor a entender a régua; uma view ao lado é
-- consultada por quem precisa da explicação e ignorada por quem não precisa.
--
-- Os motivos, e por que a distinção importa (o encaminhamento é diferente):
--   sem_demanda    · a conta foi feita e o denominador é ZERO — não chegou
--                    solicitação, não houve inscrição. Não é falha de ninguém;
--                    é o fato. Cobrar preenchimento aqui é caçar fantasma.
--   sem_registro   · a operação existe mas não é registrada no sistema (líder
--                    em treinamento nunca marcado, encontro sem chamada).
--                    Encaminhamento: rotina da equipe, não código.
--   base_zero      · ⚠️ TEM dado no período (ex.: 23 voluntários ativos), mas o
--                    KPI é variação contra um período anterior que era zero, e
--                    divisão por zero não tem resultado. O dado existe e o
--                    painel não mostra — conserto é de FÓRMULA (trocar delta_pct
--                    por soma/absoluto), decisão de quem definiu o indicador.
--   nunca_calculado· nenhuma linha em kpi_valores_calculados. Aqui sim é
--                    técnico: fonte não roteada no recálculo.
--   periodo_aberto · só há valor no período corrente e ele ainda está em curso.
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
  'Por que cada KPI ativo esta sem valor: sem_demanda (denominador zero - o fato e a ausencia) | sem_registro (a operacao existe e nao e registrada) | base_zero (TEM dado no periodo, a formula e variacao sobre zero) | nunca_calculado (fonte nao roteada) | periodo_aberto. Existe para o relatorio semanal parar de chamar tudo de "sem lancamento" - o encaminhamento de cada motivo e diferente.';

GRANT SELECT ON public.vw_kpi_sem_valor_motivo TO authenticated;
