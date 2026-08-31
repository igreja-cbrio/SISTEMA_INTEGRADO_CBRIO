-- ============================================================================
-- METAS PACTUADAS · o ×1,30 sai de onde a janela permite (2026-08-25)
--
-- Item 3 do Marcos: "se as metas já estão apresentadas substitua pelo pactuado".
-- A colheita dos 96 KRs gerais (desativados em 21/08) devolveu as metas que a
-- liderança REALMENTE pactuou, contra as metas 30 que a cascata ×1,30 escreveu.
--
-- ⚠️⚠️ MAS a substituição NÃO é mecânica, e a medição de 25/08 mostra por quê:
-- dos 52 KPIs de crescimento ativos, só **11 comparam com o ANO anterior**. Os
-- outros 41 comparam com o período imediatamente anterior (`ciclo_anterior` 29 ·
-- `mes_anterior` 5 · `evento_anterior` 6 · 1 sem comparação declarada). Escrever
-- uma meta ANUAL ("crescer 20% no ano") num KPI que mede crescimento MENSAL
-- exigiria 20% POR MÊS — cerca de 790% ao ano. Seria apertar dezenas de metas em
-- produção sem ninguém perceber, e é a lei "meta × periodicidade" numa forma
-- nova: não é o divisor da meta absoluta, é a SEMÂNTICA do delta.
--
-- Por isso esta migration substitui SÓ onde a janela da meta e a janela do
-- cálculo são a mesma. O resto está listado no fim, para decisão.
-- ============================================================================

-- ============================================================================
-- % Crescimento do valor total de entradas · meta 30 -> 15 (a pactuada)
-- ============================================================================
-- KR de origem: "Aumentar o valor total arrecadado no ano · Crescimento anual em
-- R$ · meta 15% · Auto via mem_contribuicoes".
--
-- ⚠️ Por que estes 5 são seguros: `formula_config.comparacao = 'ano_anterior'`
-- (conferido no banco em 25/08), ou seja cada mês é comparado com o MESMO mês do
-- ano anterior. Crescer 15% no ano e crescer 15% contra o mesmo mês do ano
-- passado são a MESMA grandeza na MESMA janela — a meta do KR cabe sem conversão.
--
-- ⚠️ Efeito medido: hoje os 5 marcam 26,61% (jul/2026) contra meta 30 e aparecem
-- VERMELHOS a 88,7% da meta. Com a meta pactuada de 15% viram VERDES a 177%. Ou
-- seja: o ×1,30 estava fazendo um resultado BOM (+26,6% no ano) parecer falha.
-- Este é o caso mais limpo do problema que o item 3 existe para resolver.
UPDATE public.kpi_indicadores_taticos
   SET meta_valor = 15,
       meta_descricao = '>= 15% de crescimento no valor arrecadado vs o mesmo mes do ano anterior (meta PACTUADA, colhida do KR · substitui o 30 da cascata x1,30)'
 WHERE id IN ('AMI-24', 'BRG-23', 'KIDS-22', 'ONL-24', 'SED-25')
   AND meta_valor = 30;

-- ⚠️ RESÍDUO CONHECIDO, não introduzido aqui: os 5 devolvem o MESMO número
-- (26,61%) porque doação na CBRio não é segmentada por área — o filtro de área
-- foi removido do ramo em 14/08, já que `mem_contribuicoes.area` é NULL nas
-- 20.196 linhas. São 5 rótulos de área para um número global, igual aos clones
-- de frequência do Next. Consolidar é decisão de gestão, não conserto.


-- ============================================================================
-- O QUE **NÃO** FOI SUBSTITUÍDO, E POR QUÊ (decisão pendente)
-- ============================================================================
-- BALDE 2 · a JANELA do KPI contradiz o próprio nome dele
-- ⚠️ 5 KPIs se chamam "% crescimento no número de doadores ativos em relação ao
-- último ano" e têm `comparacao = 'mes_anterior'`: AMI-23 · BRG-22 · KIDS-21 ·
-- ONL-22 · SED-24. O nome promete ano, a fórmula entrega mês. O KR pactuado é
-- "+20% no ano".
--   · Consertar a JANELA (mes_anterior -> ano_anterior) faz o nome e a conta
--     concordarem E libera a meta de 20% — mas MUDA O VALOR PUBLICADO do KPI,
--     não só a meta. Isso é decisão do Marcos/Matheus, não efeito colateral.
--   · Sem consertar a janela, a meta anual NÃO pode ser escrita ali.
--
-- BALDE 3 · grandeza diferente: precisa de KPI novo, não de meta nova
-- ⚠️ Metas de KR importantes cujo KPI do mesmo objetivo mede OUTRA COISA. Trocar
-- a meta aqui seria pôr alvo de nota num indicador de crescimento:
--   · "NPS do Next >= 70 nota"           × "% crescimento de respostas positivas"
--     -> JÁ RESOLVIDO: NEXT-04 nasceu com meta 70 na migration 20260825120000
--   · "Satisfação de voluntários >= 70"  × "% voluntários com 90%+ de respostas"
--   · "Conclusão da Jornada 180 >= 60%"  × "% crescimento de inscritos no ciclo"
--   · "Recuperação de inativos >= 60%"   × (só existe o churn, que já foi para 5%)
--   · "Onboarding de voluntário >= 90% no 1º mês" × "% em treinamento"
--   · "Alocação de quem quer servir <= 14d / 1ª resposta <= 48h" × (não há KPI)
--   · "Migração de doadores C->B 30% · B->A 5%" × (não há KPI)
--   · "Supervisão: 1 encontro/mês por líder" × "% crescimento de líderes acompanhados"
--   · "Devocional familiar >= 25% das famílias" × DEV-03 conta FAMÍLIAS/mês (não %)
-- Esses são os que o Marcos descreveu como "criar um Objetivo Geral que desdobre
-- em objetivos específicos, já integrado na ótica sistema/jornada/nsm".


-- ============================================================================
-- VERIFICAÇÃO (rodar depois · no CATÁLOGO)
-- ============================================================================
-- select id, meta_valor, formula_config->>'comparacao' as janela, meta_descricao
--   from kpi_indicadores_taticos
--  where id in ('AMI-24','BRG-23','KIDS-22','ONL-24','SED-25') order by id;
--   -> esperado: meta 15 · janela ano_anterior nos 5
--
-- select kpi_id, ultimo_valor, percentual_meta, status
--   from vw_kpi_trajetoria_atual
--  where kpi_id in ('AMI-24','BRG-23','KIDS-22','ONL-24','SED-25') order by kpi_id;
--   -> esperado: valor 26,61 · 177,4% · VERDE (era vermelho a 88,7%)
-- ============================================================================
