-- ============================================================================
-- KR · fix OKR 24 KR3 + derivar todos os KRs gerais para especificos por area
--
-- 1. OKR 24 (Aumentar valor total arrecadado) KR3 estava sobre Make a Difference,
--    que e um programa especifico CBA · nao ajuda a saber se a meta vai ser
--    atingida. Substituido pelo padrao de consistencia (0 trimestres com queda).
--
-- 2. Roda seedar_krs_especificos() em cada KR geral · cria 6 KRs especificos
--    (1 por area: kids/ami/bridge/sede/online/cba) com mesmo titulo/meta/unidade.
--    Idempotente · se ja existe filho, pula.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX OKR 24 KR3
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET titulo = '0 trimestres com queda no valor arrecadado vs trimestre anterior',
       descricao = 'Floor: nenhum trimestre regressivo no valor absoluto.',
       formula_calculo = 'count(trimestres com valor_atual < valor_anterior)',
       meta_valor = 0,
       meta_texto = '0 trimestres',
       unidade = 'trimestres',
       updated_at = now()
 WHERE objetivo_geral_id = 'd1448365-a734-c620-edad-9100c4776560'  -- Aumentar valor total
   AND ordem = 3
   AND area IS NULL  -- so o KR geral
   AND kpi_id IS NULL
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- 2. DERIVAR todos KRs gerais ativos em especificos (6 areas cada)
--    Resultado esperado: 75 KRs gerais x 6 areas = 450 KRs especificos
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_total_gerais int := 0;
  v_total_filhos int := 0;
  v_filho RECORD;
BEGIN
  FOR r IN
    SELECT id, titulo
      FROM public.kpi_krs
     WHERE area IS NULL
       AND kr_pai_id IS NULL
       AND objetivo_geral_id IS NOT NULL
       AND ativo = true
     ORDER BY ordem
  LOOP
    v_total_gerais := v_total_gerais + 1;
    FOR v_filho IN SELECT * FROM public.seedar_krs_especificos(r.id)
    LOOP
      IF v_filho.criado THEN
        v_total_filhos := v_total_filhos + 1;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Processados % KRs gerais · criados % KRs especificos novos', v_total_gerais, v_total_filhos;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio)
-- ----------------------------------------------------------------------------
-- SELECT * FROM vw_kr_cascata ORDER BY ordem LIMIT 25;
-- Espera: 75 linhas, todas com qtde_especificos = 6 e areas_cobertas = {ami,bridge,cba,kids,online,sede}

-- SELECT count(*) FROM kpi_krs WHERE area IS NOT NULL AND ativo = true;
-- Espera: 450 (75 gerais x 6 areas)
