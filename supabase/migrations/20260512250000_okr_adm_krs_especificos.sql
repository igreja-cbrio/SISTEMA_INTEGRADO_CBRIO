-- ============================================================================
-- OKR ADM · KRs especificos por area adm (mesma estrutura ministerial)
--
-- Marcos: "fazer a estrutura como os outros, adicionar o kr especifico e o
--          kpi especifico e ai mostrar o desdobramento das areas"
--
-- Estado atual:
--   2 OKRs adm (Atender SLA + Qualidade Gestao)
--   3 KRs Gerais por OKR (kr_pai_id IS NULL)
--   9 KPIs especificos por OKR (ADM-G-* / ADM-Q-*) com area='sede'
--   Faltam: KR especificos por area adm
--
-- Estado correto (igual aos OKRs ministeriais):
--   3 KRs Gerais (parent)
--   27 KRs especificos por OKR (3 KRs Gerais × 9 areas adm)
--   Cada KR especifico tem:
--     kr_pai_id = id do KR Geral
--     area      = nome da area adm (reserva_espaco, cozinha, etc)
--     titulo    = mesmo do KR Geral
--     meta_*    = mesma do KR Geral
--
-- Total: 54 KRs novos (27 × 2 OKRs)
--
-- Linkage KR especifico -> KPI:
--   - Ministerial: match por area string (kr.area = kpi.area, ambas 'ami' etc)
--   - Adm: match por formula_config.area_responsavel da KPI
--          (kr.area = 'reserva_espaco', kpi.area = 'sede',
--           kpi.formula_config.area_responsavel = 'reserva_espaco')
--   Cascata code resolve isso na ui (TabelaCascataOkr).
-- ============================================================================

WITH areas_adm AS (
  SELECT * FROM (VALUES
    ('reserva_espaco',  'Reserva de Espaço',  1),
    ('cozinha',         'Cozinha',            2),
    ('manutencao',      'Manutenção',         3),
    ('logistica_estoque','Logística Estoque', 4),
    ('logistica_compras','Logística Compras', 5),
    ('ti',              'TI',                 6),
    ('rh',              'RH',                 7),
    ('financeiro',      'Financeiro',         8),
    ('criativo',        'Criativo',           9)
  ) AS t(area_nome, label, ordem_area)
),
krs_geral_adm AS (
  -- KRs Gerais dos 2 OKRs adm (Atender + Qualidade)
  SELECT id, objetivo_geral_id, titulo, descricao,
         meta_valor, meta_texto, unidade, ordem
    FROM public.kpi_krs
   WHERE objetivo_geral_id IN (
           'a1adb000-0000-0000-0000-00000000a000'::uuid,
           'a1adb000-0000-0000-0000-00000000b000'::uuid
         )
     AND kr_pai_id IS NULL
     AND ativo = true
),
novos_krs AS (
  SELECT
    g.objetivo_geral_id,
    g.id  AS kr_pai_id,
    g.titulo,
    COALESCE(g.descricao, '') || ' · area: ' || a.label  AS descricao,
    g.meta_valor,
    g.meta_texto,
    g.unidade,
    g.ordem,
    a.area_nome AS area
  FROM krs_geral_adm g
  CROSS JOIN areas_adm a
)
INSERT INTO public.kpi_krs (
  objetivo_geral_id, kr_pai_id, kpi_id, titulo, descricao,
  meta_valor, meta_texto, unidade, ordem, area, ativo
)
SELECT n.objetivo_geral_id, n.kr_pai_id, NULL, n.titulo, n.descricao,
       n.meta_valor, n.meta_texto, n.unidade, n.ordem, n.area, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.kr_pai_id = n.kr_pai_id
      AND k.area      = n.area
      AND k.ativo     = true
 );

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
-- SELECT objetivo_geral_id, count(*) as total_filhos
--   FROM kpi_krs
--  WHERE objetivo_geral_id IN (
--    'a1adb000-0000-0000-0000-00000000a000'::uuid,
--    'a1adb000-0000-0000-0000-00000000b000'::uuid
--  )
--  AND kr_pai_id IS NOT NULL AND ativo = true
--  GROUP BY objetivo_geral_id;
-- Espera: 27 cada
--
-- SELECT k.area, count(*) FROM kpi_krs k
--  WHERE k.objetivo_geral_id = 'a1adb000-0000-0000-0000-00000000a000'::uuid
--    AND k.kr_pai_id IS NOT NULL AND ativo = true
--  GROUP BY k.area ORDER BY area;
-- Espera: 9 areas × 3 KRs = 27 (cada area aparece 3x)
-- ============================================================================
