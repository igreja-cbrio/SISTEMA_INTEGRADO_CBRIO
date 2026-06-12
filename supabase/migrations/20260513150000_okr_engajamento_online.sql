-- ============================================================================
-- OKR Engajamento Online · Marketing × Online
--
-- Marcos: "marketing apenas no online, Engajamento Online... Retenção média
--   em vídeo >=40%, Taxa de compartilhamento >=5%, cliques em series de
--   mensagem no youtube >=15%, aumento de numero de comentários >=10%/Mês,
--   comentários relevantes por culto 1%/mes... Marketing preenchendo e
--   Online responsavel por bater as metas"
--
-- Estrutura:
--   - OKR Geral 'Engajamento Online' (operacional · sem valor jornada · nao
--     aparece na matriz valor x area)
--   - 5 KPIs especificos com area='online' (Online e responsavel) +
--     formula_config.area_responsavel='marketing' (Marketing preenche)
--   - Periodicidade semanal (1 medicao por culto online)
--   - 6 tipos de dado bruto YouTube (entrada_manual=true ate API integrada)
--   - Scoring: cada KPI vale 20%, proporcional truncado (min(valor/meta, 1))
--
-- Sequência de UUID: a1adb000-...-f000 (apos OKR e000 NPS Cultos)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tipos de dado bruto · YouTube + comentarios
-- ----------------------------------------------------------------------------
INSERT INTO public.tipos_dado_bruto (
  id, nome, descricao, unidade, agregacao, granularidade, ativo, ordem,
  ministerio_id, entrada_manual
) VALUES
  ('youtube_retencao_pct',         'Retencao media em video',
   'Porcentagem media de tempo assistido por espectador (YouTube Analytics)',
   '%',    'avg', 'semanal', true, 200, null, true),
  ('youtube_share_pct',            'Taxa de compartilhamento',
   'Porcentagem de espectadores que compartilham o video (shares/views)',
   '%',    'avg', 'semanal', true, 201, null, true),
  ('youtube_ctr_series_pct',       'CTR series de mensagem (YouTube)',
   'Click-through rate dos thumbnails da serie de mensagem',
   '%',    'avg', 'semanal', true, 202, null, true),
  ('youtube_comentarios_count',    'Total de comentarios no culto',
   'Numero absoluto de comentarios no video do culto online (semanal)',
   'count','sum', 'semanal', true, 203, null, true),
  ('youtube_comentarios_relevantes','Comentarios relevantes',
   'Numero de comentarios marcados como relevantes pelo time de Marketing',
   'count','sum', 'semanal', true, 204, null, true),
  ('youtube_comentarios_total',    'Total de comentarios (denominador relevantes)',
   'Total geral de comentarios para calculo de % relevantes',
   'count','sum', 'semanal', true, 205, null, true)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  agregacao = EXCLUDED.agregacao,
  granularidade = EXCLUDED.granularidade,
  entrada_manual = EXCLUDED.entrada_manual,
  ativo = true;

-- ----------------------------------------------------------------------------
-- 2. OKR Geral · Engajamento Online (f000)
--    tipo_okr=operacional · sem valores (nao entra na matriz valor x area)
--    Marketing preenche, Online e responsavel
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_objetivos_gerais (
  id, direcionador_id, nome, indicador_geral, valores,
  ordem, ativo, tipo_okr, meta_descricao, meta_valor
)
VALUES (
  'a1adb000-0000-0000-0000-00000000f000'::uuid,
  '11111111-1111-1111-1111-111111111111',
  'Engajamento Online · Marketing',
  'Score composto · 5 metricas YouTube com peso igual (20% cada · proporcional truncado)',
  ARRAY[]::text[],
  35, true, 'operacional',
  'Score composto >=80% (cada KPI atinge sua meta especifica)', 80
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  indicador_geral = EXCLUDED.indicador_geral,
  tipo_okr = EXCLUDED.tipo_okr,
  ordem = EXCLUDED.ordem,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  ativo = true;

-- ----------------------------------------------------------------------------
-- 3. KRs Gerais · 1 por meta (o KR e o "objetivo especifico" do Marcos)
--    Cada KR vale 20% do score composto
-- ----------------------------------------------------------------------------
WITH novos_krs AS (
  SELECT * FROM (VALUES
    ('a1adb000-0000-0000-0000-00000000f000'::uuid,
     'Retencao media em video >=40%',
     'Tempo medio assistido por espectador (YouTube Analytics)',
     40, '>=40%', '%', 1),
    ('a1adb000-0000-0000-0000-00000000f000'::uuid,
     'Taxa de compartilhamento >=5%',
     'Espectadores que compartilham o video',
     5, '>=5%', '%', 2),
    ('a1adb000-0000-0000-0000-00000000f000'::uuid,
     'CTR series de mensagem >=15%',
     'Click-through rate dos thumbnails das series',
     15, '>=15%', '%', 3),
    ('a1adb000-0000-0000-0000-00000000f000'::uuid,
     'Aumento de numero de comentarios >=10% por mes',
     'Crescimento mensal no volume de comentarios',
     10, '>=10%/mes', '%', 4),
    ('a1adb000-0000-0000-0000-00000000f000'::uuid,
     'Comentarios relevantes >=1% por culto',
     'Razao de comentarios relevantes sobre total · por culto',
     1, '>=1%/culto', '%', 5)
  ) AS t(objetivo_geral_id, titulo, descricao, meta_valor, meta_texto, unidade, ordem)
)
INSERT INTO public.kpi_krs (
  objetivo_geral_id, kpi_id, titulo, descricao,
  meta_valor, meta_texto, unidade, ordem, ativo
)
SELECT n.objetivo_geral_id, NULL, n.titulo, n.descricao,
       n.meta_valor, n.meta_texto, n.unidade, n.ordem, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.objetivo_geral_id = n.objetivo_geral_id
      AND k.ordem = n.ordem
      AND k.kpi_id IS NULL
      AND k.area IS NULL
 );

-- ----------------------------------------------------------------------------
-- 4. KPIs especificos · 5 KPIs ligados ao OKR
--    Todos area='online' (Online responsavel) + formula_config com
--    area_responsavel='marketing' (Marketing preenche)
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  ('MKT-ONL-RETENCAO', 'Retencao media em video',
   'Porcentagem media de tempo assistido por espectador no culto online',
   'online', ARRAY[]::text[], 'semanal',
   '>=40%', 40, '%', true, true,
   'a1adb000-0000-0000-0000-00000000f000'::uuid,
   'operacional', 'soma_periodo',
   '{"dado_tipo":"youtube_retencao_pct","area_responsavel":"marketing","grupo":"marketing","contexto":"culto_online"}'::jsonb),

  ('MKT-ONL-SHARE', 'Taxa de compartilhamento',
   'Porcentagem de espectadores que compartilham o video',
   'online', ARRAY[]::text[], 'semanal',
   '>=5%', 5, '%', true, true,
   'a1adb000-0000-0000-0000-00000000f000'::uuid,
   'operacional', 'soma_periodo',
   '{"dado_tipo":"youtube_share_pct","area_responsavel":"marketing","grupo":"marketing","contexto":"culto_online"}'::jsonb),

  ('MKT-ONL-CTR', 'CTR series de mensagem',
   'Click-through rate dos thumbnails das series no YouTube',
   'online', ARRAY[]::text[], 'semanal',
   '>=15%', 15, '%', true, true,
   'a1adb000-0000-0000-0000-00000000f000'::uuid,
   'operacional', 'soma_periodo',
   '{"dado_tipo":"youtube_ctr_series_pct","area_responsavel":"marketing","grupo":"marketing","contexto":"culto_online"}'::jsonb),

  ('MKT-ONL-COMENT-CRESC', 'Aumento de comentarios',
   'Crescimento percentual no numero de comentarios vs periodo anterior',
   'online', ARRAY[]::text[], 'semanal',
   '>=10%', 10, '%', true, true,
   'a1adb000-0000-0000-0000-00000000f000'::uuid,
   'operacional', 'delta_pct',
   '{"dado_tipo":"youtube_comentarios_count","comparacao":"ciclo_anterior","area_responsavel":"marketing","grupo":"marketing","contexto":"culto_online"}'::jsonb),

  ('MKT-ONL-COMENT-REL', 'Comentarios relevantes',
   'Porcentagem de comentarios classificados como relevantes pelo time',
   'online', ARRAY[]::text[], 'semanal',
   '>=1%', 1, '%', true, true,
   'a1adb000-0000-0000-0000-00000000f000'::uuid,
   'operacional', 'razao',
   '{"numerador":"youtube_comentarios_relevantes","denominador":"youtube_comentarios_total","area_responsavel":"marketing","grupo":"marketing","contexto":"culto_online"}'::jsonb)

ON CONFLICT (id) DO UPDATE SET
  indicador = EXCLUDED.indicador,
  descricao = EXCLUDED.descricao,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  formula_config = EXCLUDED.formula_config,
  tipo_calculo = EXCLUDED.tipo_calculo,
  objetivo_geral_id = EXCLUDED.objetivo_geral_id,
  tipo_kpi = EXCLUDED.tipo_kpi,
  periodicidade = EXCLUDED.periodicidade,
  ativo = true,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 5. View pra score composto do OKR (proporcional truncado)
--    Cada KPI contribui min(valor/meta, 1) * peso_igual
--    Por enquanto cobre o OKR f000 (Engajamento Online)
--    Generaliza facil pra outros OKRs no futuro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_okr_score_composto AS
WITH ultimos_valores AS (
  SELECT DISTINCT ON (kpi_id)
    kpi_id, valor_calculado, periodo_referencia, calculado_em
  FROM public.kpi_valores_calculados
  WHERE valor_calculado IS NOT NULL
  ORDER BY kpi_id, calculado_em DESC
)
SELECT
  o.id            AS okr_id,
  o.nome          AS okr_nome,
  count(k.id)     AS total_kpis,
  count(uv.kpi_id) AS kpis_com_dado,
  -- Score composto · media dos KPIs (proporcional truncado em 100%)
  -- Se KPI sem dado, conta como 0 no calculo (penaliza ate ter dado)
  CASE WHEN count(k.id) = 0 THEN NULL ELSE
    round(
      (sum(
        CASE
          WHEN uv.valor_calculado IS NULL OR k.meta_valor IS NULL OR k.meta_valor = 0 THEN 0
          ELSE least(uv.valor_calculado::numeric / k.meta_valor, 1)
        END
      ) * 100) / count(k.id),
    1)
  END AS score_composto_pct
FROM public.kpi_objetivos_gerais o
LEFT JOIN public.kpi_indicadores_taticos k
  ON k.objetivo_geral_id = o.id AND k.ativo = true
LEFT JOIN ultimos_valores uv ON uv.kpi_id = k.id
WHERE o.ativo = true
GROUP BY o.id, o.nome;

COMMENT ON VIEW public.vw_okr_score_composto IS
  'Score composto do OKR · media dos KPIs (proporcional truncado em 100%). NULL se OKR nao tem KPIs.';

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT * FROM vw_okr_score_composto WHERE okr_id = 'a1adb000-0000-0000-0000-00000000f000';
-- Espera: total_kpis=5, kpis_com_dado=0, score_composto_pct=0.0
--
-- SELECT id, indicador, tipo_calculo, formula_config FROM kpi_indicadores_taticos
--   WHERE id LIKE 'MKT-ONL-%';
-- Espera: 5 rows
--
-- SELECT count(*) FROM kpi_krs
--  WHERE objetivo_geral_id = 'a1adb000-0000-0000-0000-00000000f000'
--    AND kr_pai_id IS NULL AND ativo = true;
-- Espera: 5 KRs gerais
-- ============================================================================
