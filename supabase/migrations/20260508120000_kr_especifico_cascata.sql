-- ============================================================================
-- KR ESPECIFICO + CASCATA
--
-- Marcos confirmou em 2026-05-08 o modelo:
--   1. Lider preenche dado em /dados-brutos (por area)
--   2. KPI = formula sobre o dado (sem meta · meta vive nos KRs)
--   3. OKR ESPECIFICO = mesmo OKR geral, recortado por area · tem meta
--   4. KR ESPECIFICO = monitora se a area vai bater a meta · MESMO TITULO do
--      KR geral, area diferente
--   5. KRs especificos cascateiam pro KR geral (agregacao)
--   6. Dados especificos cascateiam pros dados gerais (somatorio em query)
--   7. Tudo alimenta mandalas e valores
--
-- Esta migration cobre o ponto 4 e 5 (estrutura + cascata).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna `area` em kpi_krs (NULL = geral · area_code = especifico)
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_krs
  ADD COLUMN IF NOT EXISTS area text;

COMMENT ON COLUMN public.kpi_krs.area IS
  'Area do KR especifico (kids/ami/bridge/sede/online/cba). NULL = KR geral (consolidado).';

-- ----------------------------------------------------------------------------
-- 2. Self-reference · kr_pai_id (KR especifico aponta pro KR geral pai)
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_krs
  ADD COLUMN IF NOT EXISTS kr_pai_id uuid REFERENCES public.kpi_krs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kr_pai ON public.kpi_krs (kr_pai_id) WHERE ativo = true;

COMMENT ON COLUMN public.kpi_krs.kr_pai_id IS
  'Self-ref: KR especifico aponta pro KR geral correspondente. NULL para o proprio KR geral.';

-- ----------------------------------------------------------------------------
-- 3. Agregacao da cascata · como o KR geral consolida os especificos
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_krs
  ADD COLUMN IF NOT EXISTS agregacao_cascata text
  CHECK (agregacao_cascata IS NULL OR agregacao_cascata IN ('sum', 'avg', 'min', 'max', 'all_or_nothing'));

COMMENT ON COLUMN public.kpi_krs.agregacao_cascata IS
  'Como o KR geral consolida os filhos: sum=soma absolutos, avg=media percentuais, min=pior caso, max=melhor caso, all_or_nothing=so verde se todos verdes. Aplicavel apenas em KRs gerais (kr_pai_id IS NULL).';

-- ----------------------------------------------------------------------------
-- 4. Constraint · KR especifico DEVE ter area + kr_pai_id consistentes
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.kpi_krs
    ADD CONSTRAINT chk_kr_area_pai CHECK (
      -- KR geral: sem area, sem pai
      (area IS NULL AND kr_pai_id IS NULL) OR
      -- KR especifico: tem area E tem pai
      (area IS NOT NULL AND kr_pai_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 5. Default agregacao_cascata baseado em unidade dos KRs gerais existentes
--    (heuristica · Marcos pode editar pelo /gestao Estrutura OKR)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET agregacao_cascata = CASE
     WHEN unidade = '%'                                  THEN 'avg'
     WHEN unidade IN ('pessoas','doadores','cultos','grupos','lideres','solicitacoes') THEN 'sum'
     WHEN meta_valor = 0                                 THEN 'sum'  -- threshold 0 falhas = soma de falhas das areas
     WHEN unidade IN ('meses','trimestres','ciclos','semanas','datas','turmas','area-mes','areas','area-ciclo') THEN 'sum'
     WHEN unidade IN ('nota','R$')                       THEN 'avg'
     ELSE 'sum'
   END
 WHERE area IS NULL
   AND ativo = true
   AND objetivo_geral_id IS NOT NULL
   AND agregacao_cascata IS NULL;

-- ----------------------------------------------------------------------------
-- 6. View · cascata KR geral -> seus filhos especificos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_kr_cascata AS
SELECT
  pai.id              AS kr_geral_id,
  pai.objetivo_geral_id,
  pai.titulo          AS kr_titulo,
  pai.unidade,
  pai.meta_valor      AS meta_geral,
  pai.meta_texto      AS meta_geral_texto,
  pai.agregacao_cascata,
  pai.ordem,
  COUNT(filho.id)     AS qtde_especificos,
  ARRAY_AGG(filho.area ORDER BY filho.area) FILTER (WHERE filho.id IS NOT NULL) AS areas_cobertas,
  ARRAY_AGG(filho.id ORDER BY filho.area) FILTER (WHERE filho.id IS NOT NULL) AS especificos_ids
FROM public.kpi_krs pai
LEFT JOIN public.kpi_krs filho
  ON filho.kr_pai_id = pai.id
 AND filho.ativo = true
WHERE pai.area IS NULL
  AND pai.kr_pai_id IS NULL
  AND pai.ativo = true
  AND pai.objetivo_geral_id IS NOT NULL
GROUP BY pai.id, pai.objetivo_geral_id, pai.titulo, pai.unidade,
         pai.meta_valor, pai.meta_texto, pai.agregacao_cascata, pai.ordem;

GRANT SELECT ON public.vw_kr_cascata TO authenticated, service_role;

COMMENT ON VIEW public.vw_kr_cascata IS
  'Para cada KR geral, lista seus KRs especificos (filhos por area). Use em UI de cascata e checagem de cobertura.';

-- ----------------------------------------------------------------------------
-- 7. Helper · seedar 6 KRs especificos (1 por area) a partir de 1 KR geral
--    Util quando Marcos quiser desdobrar um KR geral em especificos rapido.
--    Uso: SELECT public.seedar_krs_especificos('uuid-do-kr-geral');
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seedar_krs_especificos(p_kr_geral_id uuid)
RETURNS TABLE (kr_especifico_id uuid, area text, criado boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_pai RECORD;
  v_area text;
  v_existente uuid;
  v_novo uuid;
BEGIN
  SELECT * INTO v_pai
    FROM public.kpi_krs
   WHERE id = p_kr_geral_id
     AND area IS NULL
     AND kr_pai_id IS NULL
     AND ativo = true;

  IF v_pai IS NULL THEN
    RAISE EXCEPTION 'KR geral nao encontrado ou nao e geral: %', p_kr_geral_id;
  END IF;

  FOR v_area IN SELECT unnest(ARRAY['kids','ami','bridge','sede','online','cba'])
  LOOP
    SELECT id INTO v_existente
      FROM public.kpi_krs
     WHERE kr_pai_id = p_kr_geral_id
       AND area = v_area
       AND ativo = true;

    IF v_existente IS NOT NULL THEN
      RETURN QUERY SELECT v_existente, v_area, false;
      CONTINUE;
    END IF;

    INSERT INTO public.kpi_krs (
      objetivo_geral_id, kpi_id, titulo, descricao, formula_calculo,
      meta_valor, meta_texto, unidade, ordem, ativo, area, kr_pai_id
    ) VALUES (
      v_pai.objetivo_geral_id, NULL,
      v_pai.titulo,
      COALESCE(v_pai.descricao, '') ||
        CASE WHEN v_pai.descricao IS NOT NULL AND v_pai.descricao != '' THEN ' · ' ELSE '' END ||
        'Filtro: ' || v_area,
      v_pai.formula_calculo,
      v_pai.meta_valor, v_pai.meta_texto, v_pai.unidade, v_pai.ordem, true,
      v_area, p_kr_geral_id
    ) RETURNING id INTO v_novo;

    RETURN QUERY SELECT v_novo, v_area, true;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seedar_krs_especificos(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.seedar_krs_especificos(uuid) IS
  'Cria 6 KRs especificos (1 por area: kids/ami/bridge/sede/online/cba) a partir de 1 KR geral. Idempotente · pula areas que ja existem.';

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio)
-- ----------------------------------------------------------------------------
-- SELECT * FROM vw_kr_cascata ORDER BY ordem LIMIT 10;
-- SELECT * FROM seedar_krs_especificos((SELECT id FROM kpi_krs WHERE titulo LIKE 'Frequencia media acumulada%' LIMIT 1));
