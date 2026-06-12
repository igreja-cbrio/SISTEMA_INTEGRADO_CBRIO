-- ============================================================================
-- META MIGRA · de KPIs para OKR Geral (modelo OKR puro)
--
-- Marcos: "o correto é adicionar as metas as okr gerais né?"
-- Sim. KPI passa a ser apenas medicao continua · meta vive no OKR.
-- KRs continuam tendo metas proprias (volume, comparacao, threshold).
--
-- Esta migration:
--   1. Adiciona tipo_okr + dado_tipo_principal + meta_* em kpi_objetivos_gerais
--   2. Migra tipo_okr a partir do tipo_kpi mais comum dos KPIs filhos
--   3. Mapeia dado_tipo_principal de cada OKR (1 por OKR · fonte natural)
--   4. Reescreve aplicar_meta_institucional() pra escrever em OKRs
--      · quantitativo: baseline = soma de TODAS as 6 areas do ano anterior
--      · qualitativo: meta absoluta = valor institucional
--   5. Atualiza trigger
--   6. Roda 1x · alinha 25 OKRs
--   7. Limpa meta_valor_absoluto dos KPIs (deixa ver mas nao mais alimenta)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Novas colunas em kpi_objetivos_gerais
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_objetivos_gerais
  ADD COLUMN IF NOT EXISTS tipo_okr text
    CHECK (tipo_okr IS NULL OR tipo_okr IN ('qualitativo', 'quantitativo')),
  ADD COLUMN IF NOT EXISTS dado_tipo_principal text REFERENCES public.tipos_dado_bruto(id),
  ADD COLUMN IF NOT EXISTS meta_descricao text,
  ADD COLUMN IF NOT EXISTS meta_valor numeric,
  ADD COLUMN IF NOT EXISTS meta_valor_absoluto numeric;

CREATE INDEX IF NOT EXISTS idx_okr_tipo ON public.kpi_objetivos_gerais (tipo_okr) WHERE ativo = true;

COMMENT ON COLUMN public.kpi_objetivos_gerais.tipo_okr IS
  'qualitativo (processo) ou quantitativo (crescimento). Define qual meta institucional aplica.';
COMMENT ON COLUMN public.kpi_objetivos_gerais.dado_tipo_principal IS
  'tipo_dado_bruto que serve de base pra materializar alvo absoluto · ex: frequencia_culto.';
COMMENT ON COLUMN public.kpi_objetivos_gerais.meta_valor_absoluto IS
  'Alvo concreto materializado · baseline ano anterior x (1 + meta_valor%). Calculado por aplicar_meta_institucional().';

-- ----------------------------------------------------------------------------
-- 2. Popular tipo_okr a partir do tipo_kpi mais comum dos KPIs filhos
-- ----------------------------------------------------------------------------
UPDATE public.kpi_objetivos_gerais o
   SET tipo_okr = sub.tipo_kpi
  FROM (
    SELECT objetivo_geral_id, tipo_kpi
      FROM (
        SELECT objetivo_geral_id, tipo_kpi,
               ROW_NUMBER() OVER (PARTITION BY objetivo_geral_id ORDER BY count(*) DESC) AS rn
          FROM public.kpi_indicadores_taticos
         WHERE ativo = true AND tipo_kpi IS NOT NULL AND objetivo_geral_id IS NOT NULL
         GROUP BY objetivo_geral_id, tipo_kpi
      ) ranked
     WHERE rn = 1
  ) sub
 WHERE o.id = sub.objetivo_geral_id
   AND o.tipo_okr IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Mapear dado_tipo_principal de cada OKR (manual · 1 por OKR)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'frequencia_culto'
 WHERE id = '4b2bbe84-681b-fbd9-7e6f-343f72e7c1dc';  -- Aumentar frequencia
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'conversoes'
 WHERE id = '51ced6d4-baa9-bbc4-c99a-ac2b4861eb2d';  -- Aumentar Aceitacoes
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'batismos'
 WHERE id = 'ac906f19-970a-d651-8c84-28f02f01a923';  -- Aumentar batismos
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'devocionais'
 WHERE id = '576c04ec-88a2-40f3-6ba2-9d03fe65de96';  -- Aumentar Devocionais
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'voluntarios_recuperados'
 WHERE id = 'b1dea2d4-5286-44d3-d26d-ec8f59a27632';  -- Recuperar voluntarios inativos
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'frequencia_next'
 WHERE id = '68c17f72-72a3-2369-8d30-dc1f9db88a47';  -- Aumentar frequencia NEXT
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'frequencia_grupos'
 WHERE id = 'e9934d9a-dd89-6a2b-0872-d20bb2e2f6aa';  -- Aumentar frequencia grupos
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'doadores_recorrentes'
 WHERE id = '54277517-82cb-7e83-4b63-43094277a19c';  -- Aumentar dizimistas recorrentes
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'lideres_treinados'
 WHERE id = 'ad2904a2-a3ef-6836-6933-2b6e48755ce6';  -- Aumentar lideres em treinamento
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'lideres_acompanhados'
 WHERE id = '72f8d900-60df-4a3b-c9f2-4dd0f990482f';  -- Aumentar lideres acompanhados
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'grupos_ativos'
 WHERE id = 'e6f20018-78ac-1c2d-ad06-27178a7b8d53';  -- Aumentar grupos
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'nps_lideres'
 WHERE id = '72c65b56-5fce-9d0c-6f4c-f4bfbced74f5';  -- Aumentar satisfacao lideres
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'doacoes_qualidade'
 WHERE id = '8853cdc2-188f-6a5a-f678-c292ec57af86';  -- Melhorar qualidade doadores
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'voluntarios_ativos'
 WHERE id = '7709a3c7-b41b-374a-555e-7853c5207e0f';  -- Aumentar voluntarios ativos
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'voluntarios_checkin'
 WHERE id = '3b0e542e-909a-c740-c73c-61c0057f7fc6';  -- Aumentar checkin voluntarios
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'solicitacoes_servir_alocadas'
 WHERE id = '7b571264-6276-b63f-8c7f-70a64bfc5f56';  -- Garantir alocacao servir
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'nps_voluntarios'
 WHERE id = '82364ebf-a47b-ef3b-fe96-cd509ebd43ec';  -- Aumentar satisfacao voluntarios
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'inscricoes_jornada180'
 WHERE id = '8b98695d-d7ca-25c8-8150-886d0c4f92ee';  -- Aumentar inscritos jornada180
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'solicitacoes_capelania'
 WHERE id = '74cf20d3-42e2-9268-964b-11a61964624e';  -- Aumentar capelania atendidas
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'solicitacoes_aconselh'
 WHERE id = 'f65ba051-af87-fe75-4d82-c1d51c9d88f0';  -- Aumentar aconselhamento atendidas
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'novos_convertidos_atend'
 WHERE id = '5ffafa58-a8ed-d248-a410-c4c8ffd69c14';  -- Aumentar convertidos atendidos
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'voluntarios_treinamento'
 WHERE id = 'b06ccb1b-e268-c5d5-6c63-bfbeeb07a9dd';  -- Aumentar voluntarios em treinamento
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'doadores_count'
 WHERE id = '599b3036-5ae0-a761-d6f1-831c0746592f';  -- Aumentar total dizimistas
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'doacoes_valor'
 WHERE id = 'd1448365-a734-c620-edad-9100c4776560';  -- Aumentar valor arrecadado
UPDATE public.kpi_objetivos_gerais SET dado_tipo_principal = 'nps_next'
 WHERE id = '4af2c533-61d3-c3cb-6608-67ba0850455b';  -- Melhorar qualidade NEXT

-- ----------------------------------------------------------------------------
-- 4. Reescrever aplicar_meta_institucional · agora escreve em OKRs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_meta_institucional(p_tipo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta_inst RECORD;
  v_okr RECORD;
  v_total_okrs int := 0;
  v_total_materializados int := 0;
  v_baseline_inicio date;
  v_baseline_fim date;
  v_baseline numeric;
  v_target_absoluto numeric;
  v_ano int := extract(year from current_date)::int;
  v_areas text[] := ARRAY['kids', 'ami', 'bridge', 'sede', 'online', 'cba'];
  v_area text;
  v_parcial numeric;
BEGIN
  FOR v_meta_inst IN
    SELECT * FROM public.kpi_metas_institucionais
     WHERE ativo = true
       AND ano = v_ano
       AND (p_tipo IS NULL OR tipo_kpi = p_tipo)
  LOOP
    v_baseline_inicio := make_date(v_ano - 1, 1, 1);
    v_baseline_fim    := make_date(v_ano - 1, 12, 31);

    FOR v_okr IN
      SELECT id, dado_tipo_principal
        FROM public.kpi_objetivos_gerais
       WHERE ativo = true AND tipo_okr = v_meta_inst.tipo_kpi
    LOOP
      v_target_absoluto := NULL;

      IF v_meta_inst.tipo_kpi = 'quantitativo' AND v_okr.dado_tipo_principal IS NOT NULL THEN
        -- Baseline = soma de TODAS as 6 areas do ano anterior
        v_baseline := 0;
        FOREACH v_area IN ARRAY v_areas LOOP
          v_parcial := public._kpi_agregar_dado(v_okr.dado_tipo_principal, v_area, v_baseline_inicio, v_baseline_fim);
          v_baseline := v_baseline + COALESCE(v_parcial, 0);
        END LOOP;

        IF v_baseline > 0 THEN
          v_target_absoluto := round(v_baseline * (1 + v_meta_inst.meta_valor / 100), 2);
          v_total_materializados := v_total_materializados + 1;
        END IF;
      ELSIF v_meta_inst.tipo_kpi = 'qualitativo' THEN
        v_target_absoluto := v_meta_inst.meta_valor;
        v_total_materializados := v_total_materializados + 1;
      END IF;

      UPDATE public.kpi_objetivos_gerais
         SET meta_descricao = v_meta_inst.meta_descricao,
             meta_valor = v_meta_inst.meta_valor,
             meta_valor_absoluto = v_target_absoluto,
             updated_at = now()
       WHERE id = v_okr.id;

      v_total_okrs := v_total_okrs + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'okrs_atualizados', v_total_okrs,
    'okrs_com_alvo_materializado', v_total_materializados,
    'baseline_periodo', jsonb_build_object('inicio', v_baseline_inicio, 'fim', v_baseline_fim)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_meta_institucional(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Trigger · mantem auto-aplica
-- ----------------------------------------------------------------------------
-- O trigger ja existe em kpi_metas_institucionais, so chama a funcao redefinida
-- (nao precisa mexer · CREATE OR REPLACE FUNCTION acima e suficiente)

-- ----------------------------------------------------------------------------
-- 6. Roda 1x · agora escreve em 25 OKRs
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_resultado jsonb;
BEGIN
  v_resultado := public.aplicar_meta_institucional(NULL);
  RAISE NOTICE 'aplicar_meta_institucional (no nivel OKR): %', v_resultado;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Limpa meta_valor_absoluto dos KPIs (legacy · agora vive em OKR)
--    NOTA: NAO removemos meta_descricao/meta_valor dos KPIs · podem ser
--    sobrescritos individualmente como override (caso raro). Mas zeramos o
--    meta_valor_absoluto que estava materializado erroneamente nos KPIs.
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET meta_valor_absoluto = NULL
 WHERE meta_valor_absoluto IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio)
-- ----------------------------------------------------------------------------
-- SELECT id, nome, tipo_okr, dado_tipo_principal,
--        meta_valor, meta_valor_absoluto, meta_descricao
--   FROM kpi_objetivos_gerais
--  WHERE ativo = true
--  ORDER BY ordem;
-- Espera: 25 OKRs com tipo_okr setado · quantitativos com baseline
--         tem meta_valor_absoluto = baseline * 1.30
