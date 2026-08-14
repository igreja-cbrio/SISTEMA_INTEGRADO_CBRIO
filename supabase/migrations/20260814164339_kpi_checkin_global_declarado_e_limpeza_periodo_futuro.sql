-- ⚠️ JA APLICADA EM PRODUCAO em 14/08/2026 (via MCP · version 20260814164339).
--
-- (a) O check-in de voluntarios DECLARA que o numero e da igreja inteira
-- (b) Limpeza dos valores gravados em periodo FUTURO
--
-- (a) POR QUE NAO SEGMENTEI POR CAMPUS
-- SED-10/BRG-14/AMI-15/KIDS-14/ONL-17 gravam o MESMO valor (25,17% em 2026-07)
-- porque o ramo 'voluntarios_checkin' de _kpi_agregar_dado e o unico da familia
-- sem o filtro "(NOT v_filtra_area OR area = v_area_lower)" que os vizinhos tem.
--
-- Fui segmentar e a dimensao NAO EXISTE preenchida. Medido em 14/08/2026:
--   vol_teams ................ 129 times, 0 com `area`
--   vol_schedules de julho ... 1.675 escalas, 0 com `team_id`
-- Ou seja: a coluna existe no schema e nunca foi populada. O unico caminho
-- seria adivinhar a area pelo TEXTO de team_name — heuristica que produziria um
-- numero por campus que ninguem consegue auditar, e o problema aqui e
-- justamente numero que parece de um campus e e de outro lugar.
--
-- Entao: o valor CONTINUA (a taxa da igreja inteira e real e util) e passa a vir
-- DECLARADO como global. Numero certo com rotulo errado se conserta no rotulo;
-- inventar segmentacao trocaria um erro visivel por um invisivel.
--
-- ⚠️ O conserto de verdade e OPERACIONAL, nao de codigo: popular vol_teams.area
-- e vol_schedules.team_id. Com isso feito, basta acrescentar o filtro de area ao
-- ramo (a linha ja existe pronta nos vizinhos).

UPDATE public.kpi_indicadores_taticos
   SET observacoes = trim(coalesce(observacoes || E'\n\n', '') ||
       '⚠️ VALOR DA IGREJA INTEIRA, NAO DESTE CAMPUS. O calculo nao filtra por area porque a dimensao nao existe preenchida ' ||
       '(vol_teams.area nulo nos 129 times · vol_schedules.team_id nulo em 100% das escalas). Os 5 KPIs de check-in exibem ' ||
       'o MESMO numero. Para segmentar, popular vol_teams.area e vol_schedules.team_id — o filtro por area ja existe nos ' ||
       'ramos vizinhos de _kpi_agregar_dado. Registrado em 14/08/2026.'),
       updated_at = now()
 WHERE id IN ('SED-10','BRG-14','AMI-15','KIDS-14','ONL-17')
   AND coalesce(observacoes, '') NOT LIKE '%VALOR DA IGREJA INTEIRA%';

-- (b) PERIODO FUTURO
-- 14 linhas em 2026-W34 com a semana corrente sendo W33: 9 em kpi_registros
-- (placeholder zerado do lote de 13/08, responsavel='sistema') e 5 em
-- kpi_valores_calculados (recompute em massa de hoje, 15:21).
--
-- Hoje elas nao contaminam farol nenhum (a view mestra passou a filtrar
-- "< periodo corrente"), mas valor 0 gravado em periodo que ainda nao aconteceu
-- e indistinguivel de medicao real — e vira mentira no dia em que a semana virar
-- a corrente. Backup antes de apagar.
--
-- ⚠️ PENDENTE (nao resolvido aqui): identificar QUEM escreve periodo futuro no
-- recompute e travar na origem. Enquanto isso, esta limpeza precisa ser repetida
-- se as linhas voltarem — o que e sinal de que a causa segue viva.

CREATE TABLE IF NOT EXISTS public._bk_20260814_kpi_periodo_futuro AS
SELECT 'kpi_registros'::text AS tabela, id::text AS pk, indicador_id AS kpi_id,
       periodo_referencia, valor_realizado AS valor, data_preenchimento AS quando, now() AS copiado_em
  FROM public.kpi_registros
 WHERE periodo_referencia > to_char(now(), 'IYYY"-W"IW') AND periodo_referencia LIKE '%W%';

INSERT INTO public._bk_20260814_kpi_periodo_futuro
SELECT 'kpi_valores_calculados', kpi_id || '|' || periodo_referencia, kpi_id,
       periodo_referencia, valor_calculado, calculado_em, now()
  FROM public.kpi_valores_calculados
 WHERE periodo_referencia > to_char(now(), 'IYYY"-W"IW') AND periodo_referencia LIKE '%W%';

DO $$
DECLARE v_bk int; v_r int; v_c int;
BEGIN
  SELECT count(*) INTO v_bk FROM public._bk_20260814_kpi_periodo_futuro;
  IF v_bk = 0 THEN
    RAISE NOTICE 'Nenhuma linha em periodo futuro. Nada a limpar.';
    RETURN;
  END IF;

  -- ⚠️ So apaga o que E placeholder: valor ZERO. Valor diferente de zero em
  -- periodo futuro seria lancamento humano adiantado, e apagar isso destruiria
  -- trabalho de alguem — fica, e aparece no relatorio como achado.
  DELETE FROM public.kpi_registros
   WHERE periodo_referencia > to_char(now(), 'IYYY"-W"IW') AND periodo_referencia LIKE '%W%'
     AND coalesce(valor_realizado, 0) = 0;
  GET DIAGNOSTICS v_r = ROW_COUNT;

  DELETE FROM public.kpi_valores_calculados
   WHERE periodo_referencia > to_char(now(), 'IYYY"-W"IW') AND periodo_referencia LIKE '%W%'
     AND coalesce(valor_calculado, 0) = 0;
  GET DIAGNOSTICS v_c = ROW_COUNT;

  RAISE NOTICE 'Periodo futuro: backup % linhas; apagados % registros e % calculados (so valor zero).', v_bk, v_r, v_c;
END $$;
