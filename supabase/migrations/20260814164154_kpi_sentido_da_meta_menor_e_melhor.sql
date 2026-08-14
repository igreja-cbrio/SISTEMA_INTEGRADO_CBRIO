-- ⚠️ JA APLICADA EM PRODUCAO em 14/08/2026 (via MCP · version 20260814164154).
--
-- Farol passa a saber que em alguns KPIs MENOR E MELHOR
--
-- Achado que so ficou visivel depois de a migration
-- kpi_farol_le_as_duas_fontes_e_periodo_fechado acender o painel (28 -> 112
-- farois acesos): a regra de status assumia "maior e melhor" para TODOS, e o
-- resultado eram cores invertidas em indicadores de teto. Medido:
--
--   RH-03  Rotatividade do Staff ....... 0,00% contra teto 10% -> VERMELHO
--          (zero demissao em julho e o melhor resultado possivel)
--   PROD-CULTO-FALHAS  Falhas .......... 1 contra teto 3 ....... -> VERMELHO
--   PROD-CULTO-ESTAB   Ocorrencias ..... 3 contra teto 2 ....... -> VERDE
--   MKT-LEAD  Lead time medio .......... 20,9 dias contra 7 .... -> VERDE
--
-- Cor invertida e pior que cor ausente: quem le o painel decide ao contrario.
--
-- ⚠️ CLASSIFICACAO CONSERVADORA, por evidencia: so entram os 4 casos em que o
-- nome E a meta concordam que a meta e um TETO. Ficam de FORA de proposito:
--   - "% de voluntarios que pararam de servir" (5 KPIs) — o nome sugere teto,
--     mas a meta e 90, o que so faz sentido se o indicador medir quem
--     CONTINUOU. Nome e meta se contradizem; decidir sozinho seria escolher
--     qual dos dois esta errado. Fica maior_melhor ate alguem do Voluntariado
--     dizer o que o numero mede.
--   - "Razao demanda / capacidade" (meta 100%) — pode ser teto (nao passar da
--     capacidade) ou alvo (ocupar 100%). Mesma razao.
--
-- Default 'maior_melhor' preserva o comportamento de todos os outros 164.
--
-- A view abaixo e IDENTICA a da 20260814164015, com duas mudancas: o ramo
-- menor_melhor no CASE do status, e sentido_meta exposta no final.

ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS sentido_meta text NOT NULL DEFAULT 'maior_melhor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.kpi_indicadores_taticos'::regclass
       AND conname = 'chk_kpi_sentido_meta'
  ) THEN
    ALTER TABLE public.kpi_indicadores_taticos
      ADD CONSTRAINT chk_kpi_sentido_meta
      CHECK (sentido_meta IN ('maior_melhor', 'menor_melhor'));
  END IF;
END $$;

COMMENT ON COLUMN public.kpi_indicadores_taticos.sentido_meta IS
'Direcao da meta. maior_melhor (default) = atingir ou passar a meta e bom. menor_melhor = a meta e um TETO (rotatividade, falhas, ocorrencias, lead time): ficar abaixo e bom. '
'⚠️ So classificar como menor_melhor quando o nome do indicador E o valor da meta concordarem que e teto — nome que sugere teto com meta alta significa que o indicador mede o complemento, e ai a correcao e no indicador, nao aqui.';

DO $$
DECLARE v int;
BEGIN
  UPDATE public.kpi_indicadores_taticos
     SET sentido_meta = 'menor_melhor', updated_at = now()
   WHERE id IN ('RH-03', 'PROD-CULTO-FALHAS', 'PROD-CULTO-ESTAB', 'MKT-LEAD');
  GET DIAGNOSTICS v = ROW_COUNT;
  IF v <> 4 THEN
    RAISE EXCEPTION 'Esperava marcar 4 KPIs como menor_melhor, marquei %. Conferir os ids.', v;
  END IF;
  RAISE NOTICE '% KPIs marcados como menor_melhor.', v;
END $$;

-- A view passa a respeitar o sentido.
CREATE OR REPLACE VIEW public.vw_kpi_taticos_status AS
 WITH periodo_atual AS (
         SELECT 'semanal'::text AS periodicidade, to_char(now(), 'IYYY"-W"IW'::text) AS periodo
        UNION ALL SELECT 'mensal'::text, to_char(now(), 'YYYY-MM'::text)
        UNION ALL SELECT 'trimestral'::text, (to_char(now(), 'YYYY'::text) || '-Q'::text) || to_char(now(), 'Q'::text)
        UNION ALL SELECT 'semestral'::text, (to_char(now(), 'YYYY'::text) || '-S'::text) ||
                CASE WHEN EXTRACT(month FROM now()) <= 6::numeric THEN '1'::text ELSE '2'::text END
        UNION ALL SELECT 'anual'::text, to_char(now(), 'YYYY'::text)
        ),
      -- Uniao das DUAS fontes. Periodo ordena lexicograficamente DENTRO da
      -- mesma periodicidade, entao "< periodo_atual" = ultimo periodo FECHADO.
      valores AS (
         SELECT r.indicador_id AS kpi_id, r.periodo_referencia, r.valor_realizado AS valor,
                r.data_preenchimento AS quando, r.responsavel, r.origem, 'registro'::text AS fonte
           FROM kpi_registros r
          WHERE r.valor_realizado IS NOT NULL
        UNION ALL
         SELECT c.kpi_id, c.periodo_referencia, c.valor_calculado,
                c.calculado_em, 'sistema'::text, 'calculado'::text, 'calculado'::text
           FROM kpi_valores_calculados c
          WHERE c.valor_calculado IS NOT NULL
        ),
      -- tipo_calculo do KPI decide a fonte autoritativa (regra unica da casa)
      valores_efetivos AS (
         SELECT v.*, k.periodicidade
           FROM valores v
           JOIN kpi_indicadores_taticos k ON k.id = v.kpi_id
          WHERE (k.tipo_calculo IS DISTINCT FROM 'manual' AND v.fonte = 'calculado')
             OR (k.tipo_calculo IS NOT DISTINCT FROM 'manual' AND v.fonte = 'registro')
             OR NOT EXISTS (
                  SELECT 1 FROM valores v2 WHERE v2.kpi_id = v.kpi_id
                    AND v2.periodo_referencia = v.periodo_referencia AND v2.fonte <> v.fonte)
        ),
      ultimo_fechado AS (
         SELECT DISTINCT ON (v.kpi_id) v.kpi_id, v.periodo_referencia, v.valor, v.quando, v.responsavel, v.origem
           FROM valores_efetivos v
           JOIN periodo_atual pa_1 ON pa_1.periodicidade = v.periodicidade
          WHERE v.periodo_referencia < pa_1.periodo
          ORDER BY v.kpi_id, v.periodo_referencia DESC, v.fonte
        ),
      em_curso AS (
         SELECT DISTINCT ON (v.kpi_id) v.kpi_id, v.periodo_referencia, v.valor
           FROM valores_efetivos v
           JOIN periodo_atual pa_1 ON pa_1.periodicidade = v.periodicidade
          WHERE v.periodo_referencia = pa_1.periodo
          ORDER BY v.kpi_id, v.fonte
        ),
      metas AS (
         SELECT t.id,
            CASE WHEN t.meta_valor_absoluto IS NOT NULL
                 THEN round(t.meta_valor_absoluto / CASE t.periodicidade
                        WHEN 'semanal' THEN 52 WHEN 'mensal' THEN 12
                        WHEN 'trimestral' THEN 4 WHEN 'semestral' THEN 2 ELSE 1 END::numeric, 2)
                 ELSE t.meta_valor END AS meta_periodo
           FROM kpi_indicadores_taticos t
        )
 SELECT t.id, t.kpi_estrategico_id, t.area, t.indicador, t.descricao, t.periodicidade,
    t.periodo_offset_meses, t.meta_descricao, t.meta_valor, t.meta_valor_absoluto, t.unidade,
    t.responsavel_area, t.apuracao, t.sort_order, t.fonte_auto, t.valores, t.pilar, t.is_okr,
    t.ativo, t.lider_funcionario_id,
    f.nome AS lider_nome, f.cargo AS lider_cargo,
    pa.periodo AS periodo_atual,
    uf.periodo_referencia AS ultimo_periodo,
    uf.valor AS ultimo_valor,
    uf.quando AS ultima_data,
    uf.responsavel AS ultimo_responsavel,
    uf.origem AS ultima_origem,
    m.meta_periodo AS meta_efetiva,
    m.meta_periodo,
        CASE
            WHEN uf.valor IS NULL THEN 'pendente'::text
            WHEN m.meta_periodo IS NULL OR m.meta_periodo = 0::numeric THEN
                CASE WHEN uf.valor > 0::numeric THEN 'verde'::text ELSE 'vermelho'::text END
            WHEN t.sentido_meta = 'menor_melhor' THEN
                CASE
                    WHEN uf.valor <= m.meta_periodo THEN 'verde'::text
                    WHEN uf.valor <= (m.meta_periodo * 1.1) THEN 'amarelo'::text
                    ELSE 'vermelho'::text
                END
            WHEN uf.valor >= m.meta_periodo THEN 'verde'::text
            WHEN uf.valor >= (m.meta_periodo * 0.9) THEN 'amarelo'::text
            ELSE 'vermelho'::text
        END AS status,
    -- COLUNAS NOVAS (no final · o valor ao vivo, que o farol NAO julga)
    ec.periodo_referencia AS periodo_em_curso,
    ec.valor AS valor_em_curso,
    t.sentido_meta
   FROM kpi_indicadores_taticos t
     LEFT JOIN rh_funcionarios f ON f.id = t.lider_funcionario_id
     LEFT JOIN ultimo_fechado uf ON uf.kpi_id = t.id
     LEFT JOIN em_curso ec ON ec.kpi_id = t.id
     LEFT JOIN metas m ON m.id = t.id
     LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
  WHERE t.ativo = true;
