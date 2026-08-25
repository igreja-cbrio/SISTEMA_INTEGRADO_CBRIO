-- ============================================================================
-- NEXT · alinhamento dos indicadores à ótica sistema | jornada | nsm (2026-08-25)
--
-- Pedido do Marcos: "o next precisamos de frequência, nps kpís de sistema, na
-- jornada aí seria kpi de next × valor (quantas pessoas que fizeram o next estão
-- engajados em algum outro valor), e nsm, convertidos que fizeram next".
--
-- ⚠️⚠️ CORREÇÃO DE ETIQUETA achada ao medir (25/08): os KPIs que PARECIAM ser o
-- "next × valor" medem INTENÇÃO, não engajamento. `next.batismos`,
-- `next.voluntarios` e `next.dizimo` contam `next_matriculas.indicou_*` — a
-- marcação feita no fim do encontro — enquanto o NOME deles promete "convertidos
-- em batizandos/voluntários/doadores". Intenção é operação do Next (`sistema`);
-- engajamento real é `jornada`. Etiquetar os 3 como `jornada` publicaria "50%
-- converteram em voluntários" onde o dado diz "50% disseram que queriam".
--
-- Resultado do alinhamento:
--   sistema  · frequência (NEXT-05 novo) · NPS (NEXT-04) · as 3 indicações
--              (NEXT-01/02/03, renomeadas pra dizer o que medem) · GEN-04
--   jornada  · NEXT-06 novo: % dos que FIZERAM o Next engajados em >=1 valor
--   nsm      · AMI/BRG/ONL/SED-NEXT90 (já estavam · nada a fazer)
--
-- Aditiva. Nenhuma coluna ou constraint existente é removida.
-- ============================================================================

-- ============================================================================
-- PARTE 1 · a frequência do Next parou de ler a camada MORTA
-- ============================================================================
-- ⚠️⚠️ O `dado_tipo` `frequencia_next` lê `next_inscricoes.check_in_at` — a
-- camada aposentada no cutover de turmas (17/06/2026). Medido em 25/08: a última
-- presença ali é de **13/05/2026**; a chamada real vive em `next_presencas`
-- (3.882 linhas, última em 23/08). Ativar KPI de frequência sem repontar entrega
-- um indicador que marca ZERO para sempre e ninguém entende por quê — a mesma
-- doença que matou o lembrete de véspera e a aba Next do app.
--
-- ⚠️ O ramo `frequencia_next` de `_kpi_agregar_dado` NÃO é patchado aqui, e é
-- decisão: (a) os únicos KPIs que o consomem são os 5 clones por área, que
-- seguem INATIVOS (o Next não tem dimensão de área — ver PARTE 4); (b) trocar
-- `next_inscricoes` por `next_presencas` num replace textual deixaria o filtro
-- `check_in_at`, coluna que `next_presencas` NÃO tem — a função passaria a
-- estourar em vez de contar. O KPI de frequência que LIGA (NEXT-05) usa a função
-- abaixo, que é a régua canônica.
--
-- ⚠️⚠️ PARA QUEM FOR ATIVAR OS 5 CLONES DEPOIS: repontar o ramo é pré-requisito,
-- senão eles marcam zero para sempre.

CREATE OR REPLACE FUNCTION public.fn_next_frequencia_periodo(
  p_inicio date,
  p_fim    date
) RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(DISTINCT p.matricula_id)::int
    FROM next_presencas p
    JOIN next_encontros e ON e.id = p.encontro_id
   WHERE p.presente = true
     AND e.data IS NOT NULL
     AND e.data >= p_inicio
     AND e.data <  p_fim
$$;

COMMENT ON FUNCTION public.fn_next_frequencia_periodo(date, date) IS
  'Pessoas DISTINTAS presentes em encontro do Next cuja DATA cai no periodo. '
  'Fonte viva: next_presencas x next_encontros (a camada next_inscricoes.check_in_at '
  'morreu no cutover de 17/06/2026 - ultima presenca 13/05). Encontro sem data fica '
  'fora: sem data nao ha periodo. Conta PESSOA, nao linha (lei da casa). '
  'Chamada pelo coletor next.frequencia (NEXT-05) - regua em UM lugar so.';

-- ⚠️ Quem chama é o BACKEND (coletor, com service_role). Nenhum cliente chama
-- com a chave pública, então não recebe grant para authenticated (lei de 10/08).
REVOKE ALL ON FUNCTION public.fn_next_frequencia_periodo(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_frequencia_periodo(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_next_frequencia_periodo(date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_next_frequencia_periodo(date, date) TO service_role;


-- ============================================================================
-- PARTE 2 · NPS do Next ganha fonte e liga
-- ============================================================================
-- ⚠️ O coletor `next.nps` EXISTE no código desde 18/08 (kpiAutoCollector.js) e
-- há 2 pesquisas `contexto_kpi='nps_next'` ATIVAS — o que faltava era o KPI
-- apontar pra ele. Sem `fonte_auto`, `coletarTodos` nunca visita a linha.
UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = 'next.nps',
       ativo      = true,
       linhagem   = 'sistema'
 WHERE id = 'NEXT-04'
   AND fonte_auto IS NULL;


-- ============================================================================
-- PARTE 3 · as 3 indicações: ligam, e o nome passa a dizer o que medem
-- ============================================================================
-- ⚠️ O indicador dizia "convertidos em batizandos/voluntários" e o coletor conta
-- `indicou_*`. Nome que promete conversão sobre dado de intenção é o tipo de
-- número que ninguém contesta na reunião — e decide errado.
UPDATE public.kpi_indicadores_taticos
   SET ativo = true, linhagem = 'sistema',
       indicador = '% dos inscritos nao batizados que indicaram batismo no Next'
 WHERE id = 'NEXT-01';

UPDATE public.kpi_indicadores_taticos
   SET ativo = true, linhagem = 'sistema',
       indicador = '% dos inscritos nao voluntarios que indicaram servir no Next'
 WHERE id = 'NEXT-02';

UPDATE public.kpi_indicadores_taticos
   SET ativo = true, linhagem = 'sistema',
       indicador = '% dos inscritos que indicaram dizimo/oferta no Next'
 WHERE id = 'NEXT-03';

-- GEN-04 mede o FOLLOW-THROUGH da indicação de dízimo (`next_indicacoes` com
-- status='concluido'), não "% dos que fizeram o Next que doam" — denominador é
-- indicação, não pessoa. Por isso `sistema`, não `jornada`.
UPDATE public.kpi_indicadores_taticos
   SET ativo = true, linhagem = 'sistema'
 WHERE id = 'GEN-04';


-- ============================================================================
-- PARTE 4 · os 2 KPIs que faltavam
-- ============================================================================
-- NEXT-05 · frequência (o nível, não o crescimento)
-- ⚠️ 1 KPI, igreja toda — NÃO 5 por área. Medido em 25/08: `next_turmas`,
-- `next_encontros` e `next_matriculas` NÃO têM dimensão de área. Ativar os 5
-- clones por área (AMI-03, BRG-04, CBA-03, KIDS-12, ONL-12) publicaria o MESMO
-- número global cinco vezes com rótulo de área diferente. Eles ficam inativos.
INSERT INTO public.kpi_indicadores_taticos
  (id, indicador, area, periodicidade, tipo_calculo, fonte_auto, unidade,
   sentido_meta, valores, linhagem, is_okr, ativo, meta_descricao)
SELECT 'NEXT-05',
       'Frequencia do Next · pessoas presentes no mes',
       'next', 'mensal', 'manual', 'next.frequencia', 'pessoas',
       'maior_melhor', '{}'::text[], 'sistema', false, true,
       'Meta a pactuar (o KPI nasce sem meta de proposito - meta inventada e pior que meta ausente)'
 WHERE NOT EXISTS (SELECT 1 FROM public.kpi_indicadores_taticos WHERE id = 'NEXT-05');

-- NEXT-06 · o "next × valor" que o Marcos pediu, com engajamento REAL
-- Denominador: pessoas que FIZERAM o Next (vw_next_formado_pessoa, com membro).
-- Numerador: dessas, quantas têm sinal real em >=1 valor da Jornada — a MESMA
-- matview que o Índice da Base usa (vw_pessoas_papeis_mat), pra os dois números
-- não poderem discordar.
INSERT INTO public.kpi_indicadores_taticos
  (id, indicador, area, periodicidade, tipo_calculo, fonte_auto, unidade,
   sentido_meta, valores, linhagem, is_okr, ativo, meta_descricao)
SELECT 'NEXT-06',
       '% dos que fizeram o Next engajados em >=1 valor da Jornada',
       'next', 'mensal', 'manual', 'next.engajados_valor', '%',
       'maior_melhor', '{}'::text[], 'jornada', false, true,
       'Meta a pactuar. Engajamento e ESTADO ATUAL; o denominador e acumulado (quem fez o Next ate o fim do periodo)'
 WHERE NOT EXISTS (SELECT 1 FROM public.kpi_indicadores_taticos WHERE id = 'NEXT-06');

-- ⚠️ Os dois nascem SEM META (`meta_valor` nulo) de propósito: nenhuma meta foi
-- pactuada para eles e inventar número é pior que assumir a lacuna. Efeito
-- conhecido: `status_trajetoria` mostra `sem_meta` (correto) e o `status` legado
-- mostra verde por ter valor > 0 (resíduo antigo, registrado no CLAUDE.md).
-- ⚠️ `valores = '{}'` mantém os dois FORA da mandala e da matriz de valores (a
-- régua de 14/05): quem agrupa é a `linhagem`, não a matriz.


-- ============================================================================
-- VERIFICAÇÃO (rodar depois · confere no CATÁLOGO, não no "success")
-- ============================================================================
-- 1 · a frequência lê a fonte viva (esperado ~35 pessoas em agosto/2026,
--     contra 0 se ainda estivesse na camada morta)
-- select public.fn_next_frequencia_periodo('2026-08-01','2026-09-01');
--
-- 2 · o alinhamento das etiquetas
-- select id, ativo, linhagem, fonte_auto, indicador
--   from kpi_indicadores_taticos
--  where id like 'NEXT-%' or id = 'GEN-04' order by id;
--   -> NEXT-01/02/03/04/05 e GEN-04 = sistema · NEXT-06 = jornada · todos ativo=true
--
-- 3 · os *-NEXT90 seguem em nsm e intocados
-- select id, linhagem, ativo from kpi_indicadores_taticos where id like '%-NEXT90';
--
-- 4 · os 5 clones por área seguem INATIVOS (Next não tem dimensão de área)
-- select id, ativo from kpi_indicadores_taticos
--  where id in ('AMI-03','BRG-04','CBA-03','KIDS-12','ONL-12');
--
-- 5 · depois de aplicar, rodar o coletor:
--    POST /api/kpis/v2/coletar  body {"fontes":["next."]}
-- ============================================================================
