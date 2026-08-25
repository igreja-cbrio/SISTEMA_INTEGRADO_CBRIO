-- ============================================================================
-- KPI · O FAROL PASSA A RESPEITAR "MENOR É MELHOR" (2026-08-24)
--
-- ⚠️⚠️ BUG VIVO, medido em produção em 24/08: `vw_kpi_trajetoria_atual` compara
-- SEMPRE `valor >= meta` e ignora `kpi_indicadores_taticos.sentido_meta`. Nos 4
-- KPIs ativos marcados como `menor_melhor` o farol saía EXATAMENTE INVERTIDO:
--
--   MKT-LEAD (lead time)        meta ≤7 dias  · valor 75,7 → 1081,4%  VERDE
--   PROD-CULTO-ESTAB            meta ≤2 ocorr · valor 3     →  150,0%  VERDE
--   PROD-CULTO-FALHAS           meta ≤3 ocorr · valor 1     →   33,3%  VERMELHO
--   RH-03 (rotatividade)        meta ≤10%     · valor 0     →    0,0%  VERMELHO
--
-- 75 dias de lead time contra meta de 7 aparecia VERDE; rotatividade ZERO
-- aparecia VERMELHA. Quanto pior o indicador, mais verde ele ficava.
--
-- ⚠️⚠️ NÃO ESTOU INVENTANDO SEMÂNTICA: a view IRMÃ (`vw_kpi_taticos_status`) JÁ
-- respeita a direção — medido no mesmo instante ela devolve MKT-LEAD=vermelho,
-- RH-03=verde, FALHAS=verde, ESTAB=vermelho. As duas views da casa estavam se
-- contradizendo; esta migration faz a `trajetoria_atual` concordar com a irmã,
-- que é a que está certa.
--
-- ⚠️ A definição da view é a VIVA (`pg_get_viewdef` de 24/08), não a do repo: ela
-- levou patches em produção (o `_kpi_periodo_corrente` de 18/08 está preservado
-- verbatim nos CTEs). Guarda de drift no bloco DO abaixo — se a forma viva não
-- for a que eu li, ABORTA em vez de sobrescrever.
--
-- Aditiva no contrato: as 17 colunas existentes ficam com mesmo nome, ordem e
-- tipo; `sentido_meta` entra NO FIM (CREATE OR REPLACE VIEW só permite append).
-- ============================================================================

-- ============================================================================
-- PARTE 1 · os dois helpers de direção
-- ============================================================================
-- Existem para que a régua fique em UM lugar. Espalhar `CASE WHEN sentido =
-- 'menor_melhor'` pelos 10 sítios de comparação da view é como as duas views
-- divergiram em primeiro lugar.
--
-- ⚠️ O vocabulário é `maior_melhor` | `menor_melhor` (o de `sentido_meta`).
-- Comparar com `'menor'` seco não casa NUNCA — e o efeito seria o farol de
-- churn/prazo continuar verde ao estourar.

CREATE OR REPLACE FUNCTION public._kpi_atingiu(
  p_valor   numeric,
  p_meta    numeric,
  p_sentido text,
  p_fator   numeric DEFAULT 1
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    -- Sem valor ou sem meta não há juízo a fazer: quem decide o que exibir é a
    -- view (pendente / sem_meta). Devolver `false` aqui pintaria de vermelho
    -- todo KPI sem meta, que é alarme falso.
    WHEN p_valor IS NULL OR p_meta IS NULL OR p_meta = 0 THEN NULL
    -- ⚠️ Banda de atenção SIMÉTRICA: em maior-é-melhor o amarelo começa a 90%
    -- do alvo (meta * 0,9); em menor-é-melhor, 11% ACIMA do teto (meta / 0,9).
    -- Usar `meta * 0,9` nos dois casos apertaria o teto em vez de afrouxar.
    WHEN COALESCE(p_sentido, 'maior_melhor') = 'menor_melhor'
      THEN p_valor <= p_meta / COALESCE(NULLIF(p_fator, 0), 1)
    ELSE p_valor >= p_meta * COALESCE(NULLIF(p_fator, 0), 1)
  END
$$;

COMMENT ON FUNCTION public._kpi_atingiu(numeric, numeric, text, numeric) IS
  'O valor atingiu a meta, respeitando a direcao (maior_melhor | menor_melhor)? '
  'p_fator=1 compara contra o alvo; p_fator=0.9 e a banda de atencao (amarelo). '
  'Devolve NULL quando nao ha valor ou nao ha meta - quem decide o rotulo e a view. '
  'Usado por vw_kpi_trajetoria_atual; mudar a regua aqui muda o farol do painel.';

CREATE OR REPLACE FUNCTION public._kpi_pct_meta(
  p_valor   numeric,
  p_meta    numeric,
  p_sentido text
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_valor IS NULL OR p_meta IS NULL OR p_meta = 0 THEN NULL
    WHEN COALESCE(p_sentido, 'maior_melhor') = 'menor_melhor' THEN
      -- Em teto, o percentual é meta/valor: 75,7 dias contra ≤7 dá 9,2% (e não
      -- 1081%). ⚠️ valor <= 0 devolve 100 em vez de estourar a divisão — zero
      -- ocorrências contra um teto é a meta cumprida, não infinito.
      CASE WHEN p_valor <= 0 THEN 100 ELSE round(p_meta / p_valor * 100::numeric, 1) END
    ELSE round(p_valor / p_meta * 100::numeric, 1)
  END
$$;

COMMENT ON FUNCTION public._kpi_pct_meta(numeric, numeric, text) IS
  '% de atingimento da meta respeitando a direcao. maior_melhor = valor/meta; '
  'menor_melhor = meta/valor (teto), com valor<=0 devolvendo 100. NULL sem meta '
  'ou sem valor. Alimenta percentual_meta de vw_kpi_trajetoria_atual.';


-- ============================================================================
-- PARTE 2 · guarda de drift ANTES de recriar a view
-- ============================================================================
-- ⚠️ A view é recriada por INTEIRO a partir da definição viva que eu li em
-- 24/08. Se a forma viva divergir do que eu li, recriar apagaria em silêncio
-- alteração feita em produção (a lição do `handle_new_user`). Então: conferir
-- a impressão digital e ABORTAR, nunca sobrescrever no escuro.
DO $$
DECLARE
  v_def text;
  v_sitios int;
BEGIN
  v_def := pg_get_viewdef('public.vw_kpi_trajetoria_atual'::regclass, true);

  IF v_def LIKE '%_kpi_atingiu%' THEN
    RAISE NOTICE 'vw_kpi_trajetoria_atual JA respeita sentido_meta - recriacao e no-op';
    RETURN;
  END IF;

  -- O patch de 18/08 (zero conta em período fechado) tem que estar lá.
  IF v_def NOT LIKE '%_kpi_periodo_corrente%' THEN
    RAISE EXCEPTION 'ABORTADO: a definicao viva nao tem o patch de 18/08 (_kpi_periodo_corrente). Reler pg_get_viewdef antes de aplicar.';
  END IF;

  -- 11 sítios de `me.meta_anual / me.divisor::numeric`: 1 em meta_periodo (que
  -- eu preservo) + 10 nas comparações (que eu troco pelos helpers). Número
  -- diferente = alguém acrescentou ou removeu comparação depois que eu li.
  SELECT count(*) INTO v_sitios
    FROM regexp_matches(v_def, 'me\.meta_anual / me\.divisor::numeric', 'g');

  IF v_sitios <> 11 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 11 sitios de "me.meta_anual / me.divisor", achei %. A definicao viva divergiu da que foi lida em 24/08.', v_sitios;
  END IF;

  RAISE NOTICE 'definicao viva confere (11 sitios) - recriando a view com direcao';
END $$;


-- ============================================================================
-- PARTE 3 · a view, com direção
-- ============================================================================
-- Os 3 CTEs vêm VERBATIM da definição viva (inclusive o `_kpi_periodo_corrente`
-- de 18/08 e o ramo `semanal` que já exigia período fechado).
--
-- O que mudou: as 10 comparações `valor >= meta` viraram `_kpi_atingiu(...)`, e
-- as 2 divisões de percentual viraram `_kpi_pct_meta(...)`. O CTE `base` existe
-- só para o valor efetivo e a meta do período serem calculados UMA vez em vez
-- de repetidos 10 vezes — o resultado é idêntico ao CASE que estava inline.
CREATE OR REPLACE VIEW public.vw_kpi_trajetoria_atual AS
 WITH ultimo_manual AS (
         SELECT DISTINCT ON (r.indicador_id) r.indicador_id,
            r.periodo_referencia,
            r.valor_realizado,
            r.data_preenchimento
           FROM kpi_registros r
             JOIN kpi_indicadores_taticos ktm ON ktm.id = r.indicador_id
          WHERE r.valor_realizado IS NOT NULL AND
                CASE
                    WHEN ktm.periodicidade = 'semanal'::text THEN r.periodo_referencia < to_char(CURRENT_DATE::timestamp with time zone, 'IYYY"-W"IW'::text)
                    ELSE r.periodo_referencia < _kpi_periodo_corrente(ktm.periodicidade) OR r.valor_realizado > 0::numeric
                END
          ORDER BY r.indicador_id, r.periodo_referencia DESC
        ), ultimo_calculado AS (
         SELECT DISTINCT ON (c.kpi_id) c.kpi_id,
            c.periodo_referencia,
            c.valor_calculado,
            c.calculado_em
           FROM kpi_valores_calculados c
             JOIN kpi_indicadores_taticos ktc ON ktc.id = c.kpi_id
          WHERE c.valor_calculado IS NOT NULL AND
                CASE
                    WHEN ktc.periodicidade = 'semanal'::text THEN c.periodo_referencia < to_char(CURRENT_DATE::timestamp with time zone, 'IYYY"-W"IW'::text)
                    ELSE c.periodo_referencia < _kpi_periodo_corrente(ktc.periodicidade) OR c.valor_calculado > 0::numeric
                END
          ORDER BY c.kpi_id, c.periodo_referencia DESC
        ), meta_efetiva AS (
         SELECT k_1.id AS kpi_id,
            COALESCE(k_1.meta_valor_absoluto, t_1.meta_valor, k_1.meta_valor) AS meta_anual,
                CASE k_1.periodicidade
                    WHEN 'semanal'::text THEN 52
                    WHEN 'mensal'::text THEN 12
                    WHEN 'trimestral'::text THEN 4
                    WHEN 'semestral'::text THEN 2
                    ELSE 1
                END AS divisor
           FROM kpi_indicadores_taticos k_1
             LEFT JOIN kpi_trajetoria t_1 ON t_1.kpi_id = k_1.id AND t_1.ativa = true
        ), base AS (
         SELECT k.id,
            k.indicador,
            k.area,
            k.periodicidade,
            k.tipo_calculo,
            k.valores,
            k.is_okr,
            k.objetivo_geral_id,
            k.meta_valor_absoluto,
            k.sentido_meta,
            t.periodo_referencia AS checkpoint_periodo,
            t.meta_valor AS checkpoint_meta,
            me.meta_anual,
                CASE
                    WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN uc.periodo_referencia
                    ELSE um.periodo_referencia
                END AS ultimo_periodo,
                CASE
                    WHEN k.tipo_calculo <> 'manual'::text AND uc.valor_calculado IS NOT NULL THEN uc.valor_calculado
                    ELSE um.valor_realizado
                END AS ultimo_valor,
                -- a meta JÁ normalizada pela periodicidade (lei meta absoluta ×
                -- periodicidade): só divide quando a meta veio da cascata
                CASE
                    WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric
                    ELSE me.meta_anual
                END AS meta_periodo_calc
           FROM kpi_indicadores_taticos k
             LEFT JOIN kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
             LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
             LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
             LEFT JOIN meta_efetiva me ON me.kpi_id = k.id
          WHERE k.ativo = true
        )
 SELECT b.id AS kpi_id,
    b.indicador,
    b.area,
    b.periodicidade,
    b.tipo_calculo,
    b.valores,
    b.is_okr,
    b.objetivo_geral_id,
    b.checkpoint_periodo,
    b.checkpoint_meta,
    b.meta_anual AS meta_efetiva,
        CASE
            WHEN b.meta_valor_absoluto IS NOT NULL THEN round(b.meta_periodo_calc, 2)
            ELSE b.meta_periodo_calc
        END AS meta_periodo,
    b.ultimo_periodo,
    b.ultimo_valor,
        CASE
            WHEN b.ultimo_valor IS NULL THEN 'pendente'::text
            -- ⚠️ RESÍDUO CONSCIENTE: sem meta, a regra legada e "tem dado > 0 =
            -- verde". Fica IDÊNTICA ao que era hoje. Não existe hoje nenhum KPI
            -- menor_melhor sem meta, e inventar politica onde nao ha teto seria
            -- pior que preservar o comportamento conhecido.
            WHEN b.meta_anual IS NULL OR b.meta_anual = 0::numeric THEN
                CASE
                    WHEN b.ultimo_valor > 0::numeric THEN 'verde'::text
                    ELSE 'vermelho'::text
                END
            WHEN public._kpi_atingiu(b.ultimo_valor, b.meta_periodo_calc, b.sentido_meta) THEN 'verde'::text
            WHEN public._kpi_atingiu(b.ultimo_valor, b.meta_periodo_calc, b.sentido_meta, 0.9) THEN 'amarelo'::text
            ELSE 'vermelho'::text
        END AS status,
        CASE
            WHEN b.ultimo_valor IS NULL THEN 'sem_dado'::text
            WHEN b.meta_anual IS NULL OR b.meta_anual = 0::numeric THEN 'sem_meta'::text
            WHEN public._kpi_atingiu(b.ultimo_valor, b.meta_periodo_calc, b.sentido_meta) THEN 'no_alvo'::text
            WHEN public._kpi_atingiu(b.ultimo_valor, b.meta_periodo_calc, b.sentido_meta, 0.9) THEN 'atras'::text
            ELSE 'critico'::text
        END AS status_trajetoria,
    public._kpi_pct_meta(b.ultimo_valor, b.meta_periodo_calc, b.sentido_meta) AS percentual_meta,
    -- coluna NOVA, no fim (CREATE OR REPLACE VIEW só permite append): deixa a
    -- tela dizer "≤" em vez de "≥" sem ter que consultar o KPI de novo.
    b.sentido_meta
   FROM base b;

COMMENT ON VIEW public.vw_kpi_trajetoria_atual IS
  'Ultimo valor + farol por KPI tatico. RESPEITA sentido_meta desde 24/08/2026 '
  '(antes comparava sempre valor >= meta e invertia o farol dos menor_melhor). '
  'Zero conta em periodo FECHADO (18/08). Farol: verde = atingiu, amarelo = '
  'banda de 10%, vermelho = fora, pendente = sem dado. Concorda com a irma '
  'vw_kpi_taticos_status - se divergirem de novo, uma das duas esta errada.';


-- ============================================================================
-- PARTE 4 · o churn de voluntários deixa de pedir 90%
-- ============================================================================
-- ⚠️ "% de voluntários que pararam de servir" estava com `meta_valor = 90` e
-- `sentido_meta = maior_melhor` — herança da cascata ×1,30 sobre um indicador
-- de PERDA. Lido em português: "queremos que 90% dos voluntários parem de
-- servir, e mais é melhor". Hoje esses 5 estão sem dado coletado (aparecem
-- `pendente`), então é bomba armada, não estrago em curso: no dia em que o
-- coletor rodar, um churn de 90% apareceria como meta batida.
--
-- A meta ≤5%/mês é a régua que veio do KR desativado em 21/08 (a "régua órfã"
-- registrada no CLAUDE.md). Periodicidade dos 6 já é mensal.
--
-- ⚠️ `unidade = '%'` NÃO é cosmético: `aplicar_meta_institucional` (migration
-- 20260608140000) NÃO grava `meta_valor_absoluto` em KPI de percentual. Sem
-- isso, a próxima passada da cascata sobrescreveria a meta 5 com baseline×1,30
-- e o bug voltaria sozinho.
--
-- Guarda de idempotência no WHERE: só mexe em quem ainda está com 90/maior.
UPDATE public.kpi_indicadores_taticos
   SET sentido_meta = 'menor_melhor',
       meta_valor   = 5,
       unidade      = '%',
       meta_descricao = '<= 5% de churn no mes (regua pactuada · substitui a meta 90 herdada da cascata)'
 WHERE indicador ILIKE '%pararam de servir%'
   AND meta_valor = 90
   AND sentido_meta = 'maior_melhor';

-- ⚠️ Inclui CBA-20, que está `ativo = false`: corrigir agora evita a surpresa
-- no dia em que alguém reativar o KPI da área.


-- ============================================================================
-- VERIFICAÇÃO (rodar depois · confere no CATÁLOGO, não no "success")
-- ============================================================================
-- 1 · o farol dos menor_melhor virou (esperado: MKT-LEAD vermelho 9,2% ·
--     RH-03 verde 100% · PROD-CULTO-FALHAS verde 300% · ESTAB vermelho 66,7%)
--
-- select kpi_id, ultimo_valor, meta_periodo, percentual_meta, status, sentido_meta
--   from vw_kpi_trajetoria_atual
--  where sentido_meta = 'menor_melhor' order by kpi_id;
--
-- 2 · as DUAS views concordam? (esperado: 0 linhas · qualquer linha aqui é
--     divergência entre irmãs, que foi o que gerou este bug)
--
-- select t.kpi_id, t.status as trajetoria, s.status as taticos
--   from vw_kpi_trajetoria_atual t
--   join vw_kpi_taticos_status s on s.id = t.kpi_id
--  where t.sentido_meta = 'menor_melhor' and t.status <> s.status;
--
-- 3 · nada mudou para os maior_melhor (esperado: contagem igual à de antes)
--
-- select status, count(*) from vw_kpi_trajetoria_atual
--  where coalesce(sentido_meta,'maior_melhor') = 'maior_melhor' group by 1 order by 2 desc;
--
-- 4 · o churn
-- select id, meta_valor, unidade, sentido_meta from kpi_indicadores_taticos
--  where indicador ilike '%pararam de servir%' order by id;
-- ============================================================================
