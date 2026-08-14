-- ⚠️ JA APLICADA EM PRODUCAO em 14/08/2026 (via MCP · version 20260814163815).
-- Este arquivo existe para o repo ter o SQL: sem ele, a correcao vive so no
-- banco e a proxima sessao nao sabe que ela existe — foi assim que o gatilho de
-- auth.users ficou 2 meses fora do git.
--
-- meta_valor_absoluto so pode existir em KPI que MEDE CONTAGEM
--
-- Achado da rodada de 14/08/2026, depois das migrations de alimentacao:
-- vw_okr_score_composto passou a mostrar 100% VERDE no objetivo "check-in
-- correto de voluntarios", cujo indicador mede 25,17% (2026-07) contra KR >=95%.
--
-- A regra NAO esta errada: a LEI "Meta absoluta x periodicidade" do CLAUDE.md
-- manda dividir meta_valor_absoluto (anual, cumulativa) pelo fator da
-- periodicidade. O que esta errado e o DADO: alguem preencheu
-- meta_valor_absoluto com o mesmo numero da meta PERCENTUAL. Uma meta de TAXA
-- (90%) dividida por 12 vira 7,5, e 25,17/7,5 = 3,356 (335,6% da meta) — que o
-- cap LEAST(...,1) do score transforma num 100% plausivel.
--
-- O cap nao criou o problema; ele ESCONDEU o sintoma. Sem ele, um 335% absurdo
-- denunciaria o erro na tela.
--
-- CRITERIO (por evidencia, nao por nome do indicador): o nome comeca com "%" em
-- praticamente todos, entao o nome NAO discrimina. O que discrimina e o que o
-- valor armazenado de fato E:
--
--   MANTEM meta_valor_absoluto (10 KPIs · fonte_auto LIKE 'cultos.%'):
--     cultos.{ami,bridge,kids,online,sede}_{freq,conv} · tipo_calculo='manual',
--     entao a view le kpi_registros, onde o coletor grava a CONTAGEM BRUTA
--     (frequencia/conversoes). meta_valor_absoluto e contagem anual real
--     (sede 128.133 -> 2.464/semana · online 106.022 -> 2.039 · kids 18.405 ->
--     354 · ami 10.691 -> 206 · bridge 2.805 -> 54). Dimensionalmente coerente.
--
--   ZERA meta_valor_absoluto (61 KPIs · todo o resto): o valor guardado e
--     TAXA ou DELTA PERCENTUAL, e dividir a meta por periodicidade nao tem
--     sentido dimensional. Medido antes de aplicar:
--       - razao mensal (21): valor 79,3 vs meta_per 7,50 = 1057% da meta;
--         com a meta percentual (90) da 88% — que e a leitura correta.
--       - soma_periodo mensal (5 · o check-in): 26,6 vs 7,50 = 355%;
--         com 90 da 30% — bate com a realidade da operacao.
--       - delta_abs semestral (9) e semanal (5), delta_pct mensal (4) e
--         semestral (4), cuidados.batismo_90d_pct (4), cuidados.reuniao_aceita_pct
--         (4) e batismos.* delta_pct (5).
--
-- Efeito: meta_periodo passa a cair no COALESCE(t.meta_valor, k.meta_valor) —
-- a meta percentual, que e a comparacao certa para taxa. Nenhuma regra de view
-- foi tocada; so o dado que a alimentava errado.
--
-- REVERSIVEL: backup completo em _bk_20260814_kpi_meta_absoluta.

CREATE TABLE IF NOT EXISTS public._bk_20260814_kpi_meta_absoluta AS
SELECT id, indicador, area, periodicidade, unidade, fonte_auto, tipo_calculo,
       meta_valor, meta_valor_absoluto, now() AS copiado_em
  FROM public.kpi_indicadores_taticos
 WHERE meta_valor_absoluto IS NOT NULL;

DO $$
DECLARE
  v_backup int;
  v_alvo int;
  v_mantem int;
  v_zerados int;
BEGIN
  SELECT count(*) INTO v_backup FROM public._bk_20260814_kpi_meta_absoluta;

  SELECT count(*) INTO v_alvo
    FROM public.kpi_indicadores_taticos
   WHERE ativo AND deleted_at IS NULL
     AND meta_valor_absoluto IS NOT NULL
     AND (fonte_auto IS NULL OR fonte_auto NOT LIKE 'cultos.%');

  SELECT count(*) INTO v_mantem
    FROM public.kpi_indicadores_taticos
   WHERE ativo AND deleted_at IS NULL
     AND meta_valor_absoluto IS NOT NULL
     AND fonte_auto LIKE 'cultos.%';

  -- Guarda contra deriva: se os numeros nao forem os medidos, ALGO MUDOU no
  -- meio e a regra precisa ser reavaliada antes de escrever em 61 linhas.
  -- (Na re-execucao pos-aplicacao, alvo=0 e a migration aborta de proposito —
  --  ela NAO e idempotente por desenho: escrever de novo mascararia deriva.)
  IF v_alvo <> 61 OR v_mantem <> 10 THEN
    RAISE EXCEPTION 'Deriva detectada: alvo=% (esperado 61), mantem=% (esperado 10). Nada alterado.', v_alvo, v_mantem;
  END IF;

  IF v_backup < 71 THEN
    RAISE EXCEPTION 'Backup com % linhas (esperado >=71). Nada alterado.', v_backup;
  END IF;

  UPDATE public.kpi_indicadores_taticos
     SET meta_valor_absoluto = NULL,
         updated_at = now()
   WHERE ativo AND deleted_at IS NULL
     AND meta_valor_absoluto IS NOT NULL
     AND (fonte_auto IS NULL OR fonte_auto NOT LIKE 'cultos.%');

  GET DIAGNOSTICS v_zerados = ROW_COUNT;
  RAISE NOTICE 'meta_valor_absoluto zerada em % KPIs de taxa; % de contagem preservados; backup com % linhas.', v_zerados, v_mantem, v_backup;
END $$;

COMMENT ON COLUMN public.kpi_indicadores_taticos.meta_valor_absoluto IS
'Meta ANUAL CUMULATIVA, dividida pela periodicidade na leitura (LEI "Meta absoluta x periodicidade"). '
'⚠️ SO preencher em KPI que mede CONTAGEM (frequencia, conversoes, batismos em numero). '
'NUNCA em KPI de TAXA/percentual: dividir 90% por 12 vira 7,5 e faz um indicador a 25%% pontuar 100%% no score. '
'Corrigido em 14/08/2026 (migration kpi_meta_absoluta_so_em_contagem) em 61 KPIs; backup em _bk_20260814_kpi_meta_absoluta.';
