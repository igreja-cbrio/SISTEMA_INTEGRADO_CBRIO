-- KPIs que dependiam de `dados_brutos` passam a ler o ERP
--
-- Continuação da varredura de 14/08/2026. Dos 23 KPIs que caíam no fallback
-- manual `dados_brutos` (3 lançamentos na história toda), estes tinham a fonte
-- pronta no banco e só faltava a fiação:
--
--   FIN-03  % cumprimento de prazos de pagamento  → fin_contas_pagar (4.116 linhas)
--   RH-03   Rotatividade do staff                 → rh_funcionarios (67 ativos)
--   FIN-02  % reserva de caixa                    → 10% da arrecadação ordinária
--   RH-02   Engajamento nos treinamentos          → rh_treinamentos (vazia hoje)
--   AMI-25/BRG-24/KIDS-23/ONL-25/SED-26  NPS do Next
--
-- ⚠️ Os 4 primeiros eram `soma_periodo`, que IGNORA o período de referência
-- (usa sempre current_date) — ligar a fonte sem trocar isso faria o histórico
-- deles repetir o valor corrente em todo período. Passam a `razao`, que já
-- chama _kpi_agregar_dado com as datas do período certo, já multiplica por 100
-- e já devolve NULL quando o denominador é zero. Nada muda para os outros ~26
-- KPIs que usam `soma_periodo` — aquele conserto é decisão do Marcos/Yago.
--
-- ⚠️ O NPS do Next NÃO precisou de KPI novo: `npsKpiSync` já grava em
-- dados_brutos usando `nps_pesquisas.contexto_kpi`, e a pesquisa existe
-- (contexto_kpi='nps_next'). O que travava era o FILTRO DE ÁREA: o sync grava
-- com `area='next'` (routes/next.js: é UMA pesquisa única da igreja, por
-- desenho) e os 5 KPIs são das áreas ami/bridge/kids/online/sede — nunca
-- casava. Sem KPI novo, sem coletor novo: só a leitura no lugar certo.
--
-- ⚠️ nps_lideres e nps_voluntarios NÃO são tocados aqui: já funcionam pelo
-- mesmo caminho. Falta a PESQUISA existir com o contexto_kpi e a área certos —
-- é operação, não código.
--
-- O patch do corpo de _kpi_agregar_dado é DINÂMICO (pg_get_functiondef +
-- replace) e aborta se a âncora não casar. É a técnica da 20260729060000: a
-- definição viva pode ter ajuste feito direto em produção, e reescrever a
-- função inteira a partir do repo reverteria isso em silêncio.

DO $outer$
DECLARE
  d text;
  ancora text;
  novo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  IF d IS NULL THEN
    RAISE EXCEPTION '_kpi_agregar_dado nao encontrada';
  END IF;

  ancora := '    ELSIF p_dado_tipo = ''frequencia_next'' THEN';

  IF position('''pagamentos_no_prazo''' in d) > 0 THEN
    RAISE NOTICE 'ramos ja aplicados — nada a fazer';
    RETURN;
  END IF;

  IF position(ancora in d) = 0 THEN
    RAISE EXCEPTION 'ancora do _kpi_agregar_dado nao encontrada — nada alterado';
  END IF;

  novo :=
'    -- NPS DO NEXT · pesquisa UNICA da igreja (routes/next.js grava
    -- contexto_kpi=''nps_next'' com area=''next''). SEM filtro de area: os 5 KPIs
    -- sao por area de culto e todos leem a mesma pesquisa.
    ELSIF p_dado_tipo = ''nps_next'' THEN
      SELECT avg(valor) INTO v_resultado
        FROM public.dados_brutos
       WHERE tipo_id = ''nps_next''
         AND data BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    -- PRAZOS DE PAGAMENTO · denominador conta so o que FOI PAGO com vencimento
    -- no periodo. Conta pendente vencida fica de fora de proposito: ~44% dos
    -- titulos de qualquer mes seguem ''pendente'' meses depois (previsao que nao
    -- se concretiza, nao atraso), e inclui-los faria o KPI marcar ~40% para
    -- sempre por higiene de dado, nao por prazo.
    ELSIF p_dado_tipo = ''pagamentos_realizados'' THEN
      SELECT count(*) INTO v_resultado
        FROM public.fin_contas_pagar
       WHERE deleted_at IS NULL
         AND data_pagamento IS NOT NULL
         AND data_vencimento BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    ELSIF p_dado_tipo = ''pagamentos_no_prazo'' THEN
      SELECT count(*) INTO v_resultado
        FROM public.fin_contas_pagar
       WHERE deleted_at IS NULL
         AND data_pagamento IS NOT NULL
         AND data_pagamento <= data_vencimento
         AND data_vencimento BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    -- ROTATIVIDADE · desligamentos sobre o quadro MEDIO do periodo (media entre
    -- o inicio e o fim). Dividir pelo quadro final infla a taxa justamente no
    -- mes em que muita gente sai.
    ELSIF p_dado_tipo = ''desligamentos'' THEN
      SELECT count(*) INTO v_resultado
        FROM public.rh_funcionarios
       WHERE deleted_at IS NULL
         AND data_demissao BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    ELSIF p_dado_tipo = ''headcount_medio'' THEN
      SELECT (
        (SELECT count(*) FROM public.rh_funcionarios
          WHERE deleted_at IS NULL
            AND data_admissao <= p_data_inicio
            AND (data_demissao IS NULL OR data_demissao >= p_data_inicio))
        +
        (SELECT count(*) FROM public.rh_funcionarios
          WHERE deleted_at IS NULL
            AND data_admissao <= p_data_fim
            AND (data_demissao IS NULL OR data_demissao >= p_data_fim))
      )::numeric / 2 INTO v_resultado;
      IF v_resultado = 0 THEN RETURN NULL; END IF;
      RETURN v_resultado;

    -- RESERVA DE CAIXA · regra do Matheus (14/08/2026): reservar 10% da
    -- arrecadacao ordinaria todo mes. Alvo = 10% do que entrou pelo balanco
    -- (vw_doacoes_unificada/fin_transacoes, a MESMA fonte do valor arrecadado);
    -- realizado = o que foi lancado no centro de custo FUNDO DE RESERVA.
    -- ATENCAO: hoje o realizado e ZERO, o centro de custo existe e nao tem
    -- nenhum lancamento em 2026. O KPI passa a dizer isso em vez de ficar em
    -- branco. Para acender, o financeiro precisa lancar a transferencia mensal.
    ELSIF p_dado_tipo = ''reserva_alvo'' THEN
      SELECT coalesce(sum(valor), 0) * 0.10 INTO v_resultado
        FROM public.vw_doacoes_unificada
       WHERE fonte = ''fin_transacoes''
         AND data BETWEEN p_data_inicio AND p_data_fim;
      IF v_resultado = 0 THEN RETURN NULL; END IF;
      RETURN v_resultado;

    ELSIF p_dado_tipo = ''reserva_lancada'' THEN
      SELECT coalesce(sum(t.valor), 0) INTO v_resultado
        FROM public.fin_transacoes t
        JOIN public.fin_centros_custo c ON c.id = t.centro_custo_id
       WHERE c.codigo = ''0.01.05''
         AND t.data_competencia BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    -- TREINAMENTOS · conclusao sobre inscricao, nos treinamentos que comecaram
    -- no periodo. data_conclusao IS NOT NULL e o sinal factual de concluido
    -- (a coluna status e texto livre e a tabela esta vazia, nao da para
    -- afirmar o vocabulario dela).
    ELSIF p_dado_tipo = ''treinamentos_inscritos'' THEN
      SELECT count(*) INTO v_resultado
        FROM public.rh_treinamentos_funcionarios tf
        JOIN public.rh_treinamentos t ON t.id = tf.treinamento_id
       WHERE t.data_inicio BETWEEN p_data_inicio AND p_data_fim;
      RETURN v_resultado;

    ELSIF p_dado_tipo = ''treinamentos_concluidos'' THEN
      SELECT count(*) INTO v_resultado
        FROM public.rh_treinamentos_funcionarios tf
        JOIN public.rh_treinamentos t ON t.id = tf.treinamento_id
       WHERE t.data_inicio BETWEEN p_data_inicio AND p_data_fim
         AND tf.data_conclusao IS NOT NULL;
      RETURN v_resultado;

' || ancora;

  EXECUTE replace(d, ancora, novo);
END $outer$;

-- Os 4 KPIs saem de soma_periodo (que ignora o período) para razao (que não).
UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'razao',
       formula_config = '{"numerador": "pagamentos_no_prazo", "denominador": "pagamentos_realizados"}'::jsonb,
       unidade = '%', updated_at = now()
 WHERE id = 'FIN-03' AND deleted_at IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'razao',
       formula_config = '{"numerador": "desligamentos", "denominador": "headcount_medio"}'::jsonb,
       unidade = '%', updated_at = now()
 WHERE id = 'RH-03' AND deleted_at IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'razao',
       formula_config = '{"numerador": "reserva_lancada", "denominador": "reserva_alvo"}'::jsonb,
       unidade = '%', updated_at = now()
 WHERE id = 'FIN-02' AND deleted_at IS NULL;

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'razao',
       formula_config = '{"numerador": "treinamentos_concluidos", "denominador": "treinamentos_inscritos"}'::jsonb,
       unidade = '%', updated_at = now()
 WHERE id = 'RH-02' AND deleted_at IS NULL;
