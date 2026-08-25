-- ============================================================================
-- OS ANÉIS GANHAM LEITURA + os doadores passam a comparar com o ANO (2026-08-25)
--
-- Fecha o nível estratégico do mapa do motor. Ele tinha 3 agregações derivadas e
-- só 2 existiam:
--   1. NSM              · o funil do convertido (fluxo)        · já existia
--   2. Índice da Base   · o estoque da membresia               · fase 2A
--   3. LEITURA DOS ANÉIS· Criativo e Gestão sustentam o motor? · ESTA MIGRATION
--
-- Decisão do Marcos (25/08): "defina de acordo com tudo que passamos e execute".
-- ============================================================================

-- ============================================================================
-- PARTE 1 · BALDE 2 · os doadores passam a comparar com o ANO anterior
-- ============================================================================
-- ⚠️ Os 5 KPIs se chamam "% crescimento no número de doadores ativos EM RELAÇÃO
-- AO ÚLTIMO ANO" e tinham `formula_config.comparacao = 'mes_anterior'`: o nome
-- prometia ano, a conta entregava mês. Fazer a conta concordar com o próprio nome
-- é conserto, não mudança de política — e segue o precedente de 21/05, quando 22
-- KPIs semanais foram movidos para `ano_anterior` justamente porque "a igreja tem
-- eventos/liturgias mensais que fazem variar a frequência".
--
-- ⚠️⚠️ ISTO MUDA O VALOR PUBLICADO do KPI, não só a meta. Era decisão de gestão e
-- o Marcos autorizou executar. Com a janela certa, a meta pactuada no KR ("+20%
-- no ano") passa a caber — e substitui o 30 da cascata ×1,30.
UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         COALESCE(formula_config, '{}'::jsonb), '{comparacao}', '"ano_anterior"'
       ),
       meta_valor = 20,
       unidade = COALESCE(unidade, '%'),
       meta_descricao = '>= 20% de crescimento de doadores ativos vs o mesmo mes do ano anterior (meta PACTUADA no KR · substitui o 30 da cascata x1,30)'
 WHERE id IN ('AMI-23', 'BRG-22', 'KIDS-21', 'ONL-22', 'SED-24')
   AND formula_config->>'comparacao' = 'mes_anterior';

-- ⚠️ `unidade` recebe '%' porque estava NULA: `aplicar_meta_institucional` não
-- grava `meta_valor_absoluto` em KPI de percentual, então é isso que protege a
-- meta 20 da próxima passada da cascata (a mesma razão do churn em 24/08).


-- ============================================================================
-- PARTE 2 · fn_leitura_anel · a terceira agregação derivada
-- ============================================================================
-- ⚠️⚠️ É UM PAR, não uma média. Decisão do Marcos em (a), e a medição de 25/08
-- prova por que: o anel Criativo está com **entrega 0,0% e qualidade 10,0**. Uma
-- média única diria "5" e esconderia o diagnóstico — que é "quando entregam, o
-- cliente adora; o problema é PRAZO". Entrega e qualidade falham separado e
-- pedem ações opostas (processo × capacidade).
--
-- ⚠️ PONDERADO, não média de médias — e essa régua está PACTUADA no próprio KR
-- desativado: "Média ponderada das 9 áreas adm · soma das atendidas no prazo /
-- soma total". Média de percentuais daria o mesmo peso a uma área com 1
-- solicitação e a uma com 51 (logística compras tem 51 de 75 na Gestão).
--
-- ⚠️ ALVOS: entrega >= 85% e qualidade >= 8 (nota 0-10). ⚠️⚠️ Corrige o número que
-- eu havia proposto: sugeri "NPS >= 70", mas os KPIs `ADM-*-Q` guardam NOTA 0-10
-- (`metrica: nps_medio`, `unidade: nota`, meta 8) e o KR pactuou "8 nota · média
-- das 9 áreas adm". 70 numa escala 0-10 deixaria o anel vermelho para sempre.
--
-- ⚠️ O denominador da entrega são as solicitações cujo PRAZO JÁ VENCEU
-- (`concluiu_no_prazo` + `concluiu_atrasado` + `atrasado`). `em_andamento` fica
-- FORA: punir a área por trabalho que ainda está dentro do prazo inverteria o
-- sentido do indicador. Quantas ficaram de fora é DECLARADO.
--
-- ⚠️ "SEM DEMANDA" NÃO É FALHA (decisão em (b) e a régua de `vw_kpi_sem_valor_motivo`):
-- área sem solicitação no período não entra em numerador nem denominador, e a
-- COBERTURA vai declarada ("5 de 8 áreas com demanda"). Sem isso, cobertura
-- parcial passa por total.

CREATE OR REPLACE FUNCTION public.fn_leitura_anel(
  p_anel text,
  p_dias int DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anel        text := lower(btrim(COALESCE(p_anel, '')));
  v_dias        int  := GREATEST(COALESCE(p_dias, 90), 1);
  v_desde       date;
  v_areas       text[];
  v_total       int;
  v_vencidas    int;
  v_no_prazo    int;
  v_notas       int;
  v_media       numeric;
  v_com_demanda int;
  v_orfas       text[];
BEGIN
  IF v_anel NOT IN ('criativo', 'gestao') THEN
    RETURN jsonb_build_object(
      'anel', p_anel,
      'aviso', 'Anel desconhecido. Os aneis do mapa do motor sao criativo (combustivel) e gestao (carcaca). O Ministerial e o MOTOR - a leitura dele sao a NSM e o Indice da Base, nao um anel.',
      'calculado_em', now()
    );
  END IF;

  v_desde := (CURRENT_DATE - v_dias);

  -- ⚠️ A composição do anel é DERIVADA do catálogo de KPIs pelo PREFIXO DO ID
  -- (estrutural), não de uma lista escrita aqui: `ADM-C-*` = Criativo ·
  -- `ADM-G-*`/`ADM-Q-*` = Gestão. Assim não existe uma segunda fonte de verdade
  -- sobre quem pertence a qual anel, e área nova entra sozinha ao ganhar KPI.
  -- ⚠️ Derivar pelo NOME do objetivo seria frágil: renomear um objetivo
  -- esvaziaria o anel em silêncio.
  SELECT array_agg(DISTINCT k.formula_config->>'area_responsavel')
    INTO v_areas
    FROM public.kpi_indicadores_taticos k
   WHERE k.ativo = true
     AND k.deleted_at IS NULL
     AND k.formula_config->>'area_responsavel' IS NOT NULL
     AND (
          (v_anel = 'criativo' AND k.id LIKE 'ADM-C-%')
       OR (v_anel = 'gestao'   AND (k.id LIKE 'ADM-G-%' OR k.id LIKE 'ADM-Q-%'))
     );

  IF v_areas IS NULL OR array_length(v_areas, 1) = 0 THEN
    RETURN jsonb_build_object(
      'anel', v_anel,
      'aviso', 'Nenhum KPI ADM ativo declara area para este anel - a leitura nao pode ser calculada.',
      'calculado_em', now()
    );
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE s.sla_resolucao_status IN ('concluiu_no_prazo','concluiu_atrasado','atrasado')),
    count(*) FILTER (WHERE s.sla_resolucao_status = 'concluiu_no_prazo'),
    count(*) FILTER (WHERE s.nps_nota IS NOT NULL),
    avg(s.nps_nota) FILTER (WHERE s.nps_nota IS NOT NULL),
    count(DISTINCT s.area_responsavel)
    INTO v_total, v_vencidas, v_no_prazo, v_notas, v_media, v_com_demanda
    FROM public.vw_solicitacoes_sla s
   WHERE s.area_responsavel = ANY(v_areas)
     AND s.created_at >= v_desde;

  -- ⚠️ Área com demanda que não pertence a anel nenhum é DECLARADA, não
  -- silenciada: hoje `hospitalidade` tem solicitações e nenhum KPI ADM. Trabalho
  -- que não aparece em anel nenhum é trabalho que ninguem cobra.
  SELECT array_agg(DISTINCT s.area_responsavel)
    INTO v_orfas
    FROM public.vw_solicitacoes_sla s
   WHERE s.created_at >= v_desde
     AND s.area_responsavel IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.kpi_indicadores_taticos k
        WHERE k.ativo = true AND k.deleted_at IS NULL
          AND k.formula_config->>'area_responsavel' = s.area_responsavel
          AND k.id LIKE 'ADM-%'
     );

  RETURN jsonb_build_object(
    'anel', v_anel,
    'papel', CASE v_anel WHEN 'criativo' THEN 'combustivel' ELSE 'carcaca' END,
    'janela_dias', v_dias,
    'desde', v_desde,
    'areas', to_jsonb(v_areas),
    'entrega', jsonb_build_object(
      'pct', CASE WHEN v_vencidas > 0 THEN round((v_no_prazo * 100.0) / v_vencidas, 1) ELSE NULL END,
      'no_prazo', v_no_prazo,
      'vencidas', v_vencidas,
      'alvo', 85,
      'nota', 'Ponderado: soma das atendidas no prazo / soma das que JA venceram o SLA. em_andamento fica fora.'
    ),
    'qualidade', jsonb_build_object(
      'nota', CASE WHEN v_notas > 0 THEN round(v_media, 1) ELSE NULL END,
      'respostas', v_notas,
      'alvo', 8,
      'escala', '0-10',
      'nota_metodo', 'Media das notas de NPS interno das solicitacoes do anel (soma das notas / total de respostas).'
    ),
    'cobertura', jsonb_build_object(
      'areas_com_demanda', v_com_demanda,
      'areas_no_anel', array_length(v_areas, 1),
      'solicitacoes', v_total,
      'ainda_no_prazo', v_total - v_vencidas,
      'nota', 'Area sem demanda NAO conta como falha - fica fora do numerador e do denominador.'
    ),
    'areas_sem_anel', COALESCE(to_jsonb(v_orfas), '[]'::jsonb),
    'calculado_em', now()
  );
END $$;

COMMENT ON FUNCTION public.fn_leitura_anel(text, int) IS
  'Leitura de um ANEL do mapa do motor (criativo = combustivel · gestao = carcaca): '
  'o anel esta sustentando o motor? Devolve um PAR - entrega (% no SLA, alvo 85) e '
  'qualidade (nota 0-10 de NPS interno, alvo 8) - NUNCA uma media unica, porque as '
  'duas falham separado e pedem acoes opostas. Ponderado pela demanda (regua pactuada '
  'no KR). Area sem demanda nao e falha; cobertura e area orfa vao declaradas. '
  'O Ministerial NAO tem leitura de anel: ele e o motor, lido por NSM + Indice da Base.';

-- ⚠️ Sem grant para anon/authenticated: quem chama é o BACKEND com service_role
-- (lei de 10/08) e a função lê PII indireta (solicitações por área).
REVOKE ALL ON FUNCTION public.fn_leitura_anel(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_leitura_anel(text, int) FROM anon;
REVOKE ALL ON FUNCTION public.fn_leitura_anel(text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_leitura_anel(text, int) TO service_role;


-- ============================================================================
-- VERIFICAÇÃO (rodar depois · no CATÁLOGO)
-- ============================================================================
-- 1 · os doadores com a janela certa
-- select id, meta_valor, unidade, formula_config->>'comparacao' as janela
--   from kpi_indicadores_taticos
--  where id in ('AMI-23','BRG-22','KIDS-21','ONL-22','SED-24') order by id;
--   -> esperado: meta 20 · unidade % · janela ano_anterior
--
-- 2 · as duas leituras de anel (medido em 25/08, janela de 90 dias)
-- select public.fn_leitura_anel('criativo');
--   -> entrega 0,0% (0 de 12) · qualidade 10,0 (2 respostas) · 2 de 3 areas
-- select public.fn_leitura_anel('gestao');
--   -> entrega 26,5% (18 de 68) · qualidade 10,0 (6 respostas) · 5 de 8 areas
--   -> areas_sem_anel: ["hospitalidade"]
--
-- 3 · anel inexistente devolve aviso, nao erro
-- select public.fn_leitura_anel('ministerial');
-- ============================================================================
