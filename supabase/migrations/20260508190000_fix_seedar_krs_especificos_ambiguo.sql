-- ============================================================================
-- FIX · seedar_krs_especificos · ambiguidade na coluna "area"
--
-- A versao em 20260508120000 declarou RETURNS TABLE (... area text ...) e o
-- WHERE area IS NULL ficou ambiguo (variavel de retorno x coluna da tabela).
--
-- Fix: qualificar com nome de tabela em todos os WHERE/SELECT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seedar_krs_especificos(p_kr_geral_id uuid)
RETURNS TABLE (kr_especifico_id uuid, area_criada text, criado boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_pai RECORD;
  v_area text;
  v_existente uuid;
  v_novo uuid;
BEGIN
  SELECT k.* INTO v_pai
    FROM public.kpi_krs k
   WHERE k.id = p_kr_geral_id
     AND k.area IS NULL
     AND k.kr_pai_id IS NULL
     AND k.ativo = true;

  IF v_pai IS NULL THEN
    RAISE EXCEPTION 'KR geral nao encontrado ou nao e geral: %', p_kr_geral_id;
  END IF;

  FOR v_area IN SELECT unnest(ARRAY['kids','ami','bridge','sede','online','cba'])
  LOOP
    SELECT k.id INTO v_existente
      FROM public.kpi_krs k
     WHERE k.kr_pai_id = p_kr_geral_id
       AND k.area = v_area
       AND k.ativo = true;

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
-- Re-roda derivacao agora que a funcao esta correta
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
