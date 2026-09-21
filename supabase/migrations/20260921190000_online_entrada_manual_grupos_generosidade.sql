-- Online · entrada manual para grupos e generosidade
-- ============================================================================
-- Pedido do Matheus (21/09/2026), olhando o painel do Online:
--   "Pq nao ta sendo alimentado o kpi de crescimento de grupos?? se temos o
--    historico de grupos da ultima temporada e temos o de agora. (...) preciso
--    de um lugar para eles colocarem isso manualmente."
--   E antes: "vc implementou a funcionalidade para colocar manualmente os
--    dados de generosidade do online???"
--
-- ⚠️⚠️ A CAUSA NÃO ERA FALTA DE ALIMENTAÇÃO — É INCAPACIDADE ESTRUTURAL.
-- Medido em produção (21/09/2026), chamando `_kpi_agregar_dado` direto:
--
--   grupos_ativos · online · setembro/2026 → 22
--   grupos_ativos · online · março/2026    → 22    ← O MESMO NÚMERO
--
-- O ramo de `grupos_ativos` conta `WHERE ativo = true` **sem nenhum filtro de
-- período** — ele devolve o número de HOJE, qualquer que seja a data pedida.
-- Como ONL-08 é `delta_pct` (compara dois períodos), ele compara **hoje com
-- hoje** e devolve **0% para sempre**. Não é "não cresceu": é impossível
-- medir. O mesmo vale para ONL-09 (`lideres_treinados`: 2 agora, 2 antes).
--
-- ⚠️ E o histórico que o pedido supõe NÃO EXISTE na forma necessária: os 22
-- grupos online têm `created_at` entre 19/06 e 22/07 e são TODOS da temporada
-- T2-2026 — 19/06 é a assinatura de uma carga em massa (a mesma já registrada
-- no CLAUDE.md), não a data real de criação de cada grupo. Não há temporada
-- anterior de grupo online no banco para comparar.
--
-- ⚠️⚠️ ONL-06 (% crescimento da frequência em grupos) FICA COMO ESTÁ. Ele
-- FUNCIONA: `frequencia_grupos` filtra por área e devolveu 47 para o Online,
-- com 23,68% de crescimento medido. Criar um tipo manual ao lado dele daria
-- DUAS VERDADES sobre o mesmo número — é o erro que esta migration evita, não
-- o que ela comete.
--
-- ⚠️⚠️ A ENTRADA MANUAL VAI EM `dado_tipo` NOVO, SEM RAMO NATIVO — a lei de
-- 21/09 (migration 20260921120000): ramo nativo termina com `RETURN`
-- incondicional depois de `count(*)`, que nunca é NULL, então o fallback para
-- `dados_brutos` é INALCANÇÁVEL e o lançamento seria ignorado EM SILÊNCIO.
-- Já custou 84 lançamentos de `solicitacoes_servir_*`.

BEGIN;

-- ============================================================================
-- PARTE 1 · os tipos manuais
-- ============================================================================
-- ⚠️ `agregacao = 'last'` nos de ESTOQUE (quantos grupos existem) e `'sum'`
-- nos de FLUXO (quantas pessoas frequentaram, quanto entrou). Somar estoque
-- mês a mês contaria o mesmo grupo várias vezes.
INSERT INTO public.tipos_dado_bruto
  (id, nome, descricao, unidade, agregacao, granularidade, origem_tabela, entrada_manual, ordem)
VALUES
  ('grupos_ativos_declarado',
   'Grupos ativos (declarado)',
   'Quantos grupos a área tinha ATIVOS no fim do período. Lançado à mão porque o automático conta sempre o número de HOJE — ele não sabe responder "quantos havia em março". Use a data do FIM do período que está declarando.',
   'grupos', 'last', 'mensal', NULL, true, 94),
  ('lideres_treinamento_declarado',
   'Líderes em treinamento (declarado)',
   'Quantos líderes estavam em treinamento no fim do período. Mesmo motivo do anterior: o automático é um retrato de hoje e não reconstrói o passado.',
   'líderes', 'last', 'mensal', NULL, true, 95),
  ('doacoes_valor_declarado',
   'Generosidade · valor arrecadado (declarado)',
   'Valor que a área arrecadou no período, em reais. Lançado à mão enquanto a base nominal de contribuições não é atualizada.',
   'R$', 'sum', 'mensal', NULL, true, 96),
  ('doadores_count_declarado',
   'Generosidade · doadores (declarado)',
   'Quantas PESSOAS diferentes doaram no período. ⚠️ Não somar entre meses: quem doa todo mês é uma pessoa só.',
   'pessoas', 'last', 'mensal', NULL, true, 97),
  ('doadores_recorrentes_declarado',
   'Generosidade · doadores recorrentes (declarado)',
   'Quantos desses doadores doaram em 3 meses seguidos ou mais. Não deve passar do total de doadores.',
   'pessoas', 'last', 'mensal', NULL, true, 98)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      agregacao = EXCLUDED.agregacao,
      entrada_manual = true,
      ativo = true;

-- ⚠️ Guarda: nenhum dos tipos novos pode ter ramo nativo, ou o lançamento
-- volta a ser ignorado em silêncio.
DO $guarda$
DECLARE v_def text; v_id text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  FOREACH v_id IN ARRAY ARRAY['grupos_ativos_declarado', 'lideres_treinamento_declarado',
                              'doacoes_valor_declarado', 'doadores_count_declarado',
                              'doadores_recorrentes_declarado'] LOOP
    IF position(v_id in v_def) > 0 THEN
      RAISE EXCEPTION 'ABORTADO: % ganhou ramo nativo — a entrada manual seria ignorada em silêncio', v_id;
    END IF;
  END LOOP;
END;
$guarda$;

-- ============================================================================
-- PARTE 2 · os KPIs de GRUPOS passam a ler o declarado
-- ============================================================================
-- ⚠️ Seguro porque a série atual é LIXO, não histórico: os dois KPIs devolvem
-- 0 por construção desde sempre (delta de um snapshot contra ele mesmo).
-- Repontar não falsifica nada — corrige uma série que nunca mediu crescimento.
UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"grupos_ativos_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (grupos_ativos_declarado). Motivo: o ramo ' ||
         'nativo `grupos_ativos` conta WHERE ativo=true SEM filtro de periodo, entao devolve o ' ||
         'numero de HOJE para qualquer data — o delta_pct comparava hoje com hoje e dava 0% para ' ||
         'sempre. Medido: online = 22 em setembro E 22 em marco. Alem disso os 22 grupos online ' ||
         'tem created_at de uma carga em massa (19/06 a 22/07) e sao todos da temporada T2-2026, ' ||
         'entao nao existe ciclo anterior no banco para comparar. Lancar em /dados-brutos.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'grupos_ativos'
   AND lower(area) = 'online';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"lideres_treinamento_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (lideres_treinamento_declarado). Mesmo ' ||
         'motivo dos grupos: o ramo nativo filtra `saiu_em IS NULL`, que é o estado de HOJE, ' ||
         'entao o delta compara o mesmo retrato consigo mesmo. Medido: online = 2 nos dois lados.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'lideres_treinados'
   AND lower(area) = 'online';

-- ⚠⚠ RESÍDUO DECLARADO, e ele é REAL: o defeito de `grupos_ativos` é
-- ESTRUTURAL, então **AMI-10, BRG-09, SED-05, AMI-08, BRG-07 e SED-03 continuam
-- devolvendo 0% por construção** — o mesmo retrato comparado consigo mesmo.
-- Não foram repontados porque o pedido foi do Online e reponta-los criaria
-- digitação mensal para 3 equipes que não estão nesta conversa. Estender é UM
-- UPDATE (tirar o `lower(area) = 'online'` dos dois de cima), e é decisão de
-- quem vai digitar — não efeito colateral daqui.

-- ============================================================================
-- PARTE 3 · GENEROSIDADE · o número é da IGREJA e a fonte parou
-- ============================================================================
-- ⚠️⚠️ DOIS DEFEITOS SOMADOS, os dois medidos em 21/09/2026:
--
--  (a) Os 3 KPIs publicam o MESMO valor nas 5 áreas (-99,7 · 0,0 · 36,7). Isso
--      é CONSEQUÊNCIA DE UMA DECISÃO de 14/08 ("doação na CBRio não é
--      segmentada por área", o filtro foi removido de propósito) — mas o
--      rótulo "Generosidade · Online" faz o número parecer do Online.
--
--  (b) A fonte PAROU: `mem_contribuicoes` tem **1 linha desde julho** e
--      **zero em setembro**. O -99,7% de "crescimento de doadores" não é queda
--      de doação — é a base nominal parada desde junho. Um KPI que anuncia
--      -99,7% de queda quando ninguém parou de doar é pior que vazio.
--
-- ⇒ Repontado para o declarado. Quando a base nominal voltar a ser
-- atualizada, a decisão de voltar ao automático é de gente — e aí o histórico
-- declarado continua no banco, distinguível pelo nome do tipo.
UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"doacoes_valor_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (doacoes_valor_declarado). Motivo: o tipo ' ||
         'automatico nao e segmentado por area (decisao de 14/08) e publicava o mesmo 36,7 nas 5 ' ||
         'areas; e a base nominal parou (mem_contribuicoes: 1 linha desde julho, 0 em setembro). ' ||
         'Voltar ao automatico e decisao de gente quando a base for atualizada.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'doacoes_valor'
   AND lower(area) = 'online';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"doadores_count_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (doadores_count_declarado). O -99,7% que ' ||
         'este KPI publicava NAO era queda de doacao: era a base nominal parada desde junho.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'doadores_count'
   AND lower(area) = 'online';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         jsonb_set(formula_config, '{numerador}', '"doadores_recorrentes_declarado"'),
         '{denominador}', '"doadores_count_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (doadores_*_declarado). Mesmo motivo: fonte ' ||
         'nominal parada e numero identico nas 5 areas.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'doadores_recorrentes'
   AND lower(area) = 'online';

-- ⚠️⚠️ As outras 4 áreas NÃO foram tocadas, de propósito: o pedido foi do
-- Online, e repontar ami/bridge/kids/sede para entrada manual criaria trabalho
-- de digitação para 4 equipes que não pediram. Elas continuam no automático —
-- com o número da igreja, que é o que a decisão de 14/08 estabeleceu. Se a
-- casa quiser generosidade por área de verdade, isso é conversa de modelo
-- (`mem_contribuicoes.area` existe e está vazia), não efeito colateral daqui.

-- ============================================================================
-- INVARIANTE · nenhum tipo manual pode ter ramo nativo
-- ============================================================================
DO $inv$
DECLARE v_def text; v_ruins text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  SELECT string_agg(id, ', ') INTO v_ruins
    FROM public.tipos_dado_bruto
   WHERE ativo AND entrada_manual = true
     AND position('p_dado_tipo = ''' || id || '''' in v_def) > 0;

  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: tipos manuais com ramo nativo: %', v_ruins;
  END IF;
END;
$inv$;

COMMIT;
