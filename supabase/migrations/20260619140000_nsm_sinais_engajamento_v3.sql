-- ============================================================================
-- NSM v3 · conta SINAL de engajamento (não "valor"), casa por id/cpf/nome,
--          janela ±60d, denominador = coorte de convertidos (cui_convertidos).
-- ============================================================================
-- Decisões do Marcos (2026-06-19):
--  - O NSM mede "fez MAIS que levantar a mão". Como todo convertido já está em
--    "Seguir" por converter, contar VALORES dava 100% trivial (≥1) ou nunca
--    creditava batismo/Next (eles ficam DENTRO de Seguir). Solução: a unidade
--    passa a ser o SINAL real de engajamento; batismo e Next contam como sinais
--    próprios. Engajado = ≥1 sinal em {batismo, next, grupo, investir, servir,
--    generosidade}. (= "≥2 contando a conversão", na fala do Marcos.)
--  - Janela ±60d da conversão (60 pra trás + 60 pra frente · ordem não importa).
--  - Casamento por membro_id OU cpf OU nome (97% dos convertidos não têm CPF no
--    1º cadastro · nome é o que casa · Kevyn corrige homônimos). batismo/Next
--    têm nome/cpf na tabela; os demais só membro_id (identidade limpa = Kevyn).
--  - Denominador = nº de convertidos da coorte (cui_convertidos) na janela 90d,
--    NÃO mais a soma de decisões "fantasma" dos cultos.
--  - GRUPO sem gate de data: mem_grupo_membros.entrou_em hoje = data do import
--    (não a entrada real) → contamos "está em grupo ativo". Re-aplicar a janela
--    quando houver data de entrada real.
--  - "1º contato/trilha" NÃO é sinal (é a janela de conversão · os 86% de contato
--    vivem em cui_convertidos.primeiro_contato_status, não aqui).
-- Idempotente · CREATE OR REPLACE. Não dropa a fn_nsm_valores_engajados antiga
-- (mantida por compat até o backend unificar a tela).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Sinais de engajamento de UM convertido na janela ±p_janela da conversão.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_nsm_sinais_engajados(
  p_membro_id uuid,
  p_cpf       text,
  p_nome      text,
  p_data      date,
  p_janela    int DEFAULT 60
) RETURNS text[]
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_ini  date := p_data - p_janela;
  v_fim  date := p_data + p_janela;
  v_cpf  text := NULLIF(regexp_replace(coalesce(p_cpf, ''),  '[^0-9]', '', 'g'), '');
  v_nome text := NULLIF(lower(trim(coalesce(p_nome, ''))), '');
  v_sig  text[] := ARRAY[]::text[];
BEGIN
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN v_cpf := NULL; END IF;

  -- SEGUIR · BATISMO (id OR cpf OR nome · data ±janela)
  IF EXISTS (
    SELECT 1 FROM public.batismo_inscricoes b
     WHERE b.status = 'realizado'
       AND b.data_batismo BETWEEN v_ini AND v_fim
       AND ( b.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(b.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(b.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'batismo'); END IF;

  -- SEGUIR · NEXT (formado nas turmas id/cpf/nome OU check-in legado id/nome)
  IF EXISTS (
    SELECT 1 FROM public.next_matriculas n
     WHERE n.deleted_at IS NULL AND n.status = 'formado'
       AND n.created_at::date BETWEEN v_ini AND v_fim
       AND ( n.membro_id = p_membro_id
          OR (v_cpf  IS NOT NULL AND regexp_replace(coalesce(n.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(n.nome, ''))) = v_nome) )
  ) OR EXISTS (
    SELECT 1 FROM public.next_inscricoes ni
     WHERE ni.check_in_at IS NOT NULL
       AND ni.check_in_at::date BETWEEN v_ini AND v_fim
       AND ( ni.membro_id = p_membro_id
          OR (v_nome IS NOT NULL AND lower(trim(coalesce(ni.nome, ''))) = v_nome) )
  ) THEN v_sig := array_append(v_sig, 'next'); END IF;

  -- CONECTAR · GRUPO (membro_id · sem gate de data · entrou_em = data de import)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_grupo_membros g
     WHERE g.deleted_at IS NULL AND g.saiu_em IS NULL AND g.membro_id = p_membro_id
  ) THEN v_sig := array_append(v_sig, 'grupo'); END IF;

  -- INVESTIR · devocional / Jornada 180 / aconselhamento (membro_id · ±janela)
  IF p_membro_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.mem_devocionais d
                WHERE d.membro_id = p_membro_id AND d.concluida = true
                  AND d.data_devocional BETWEEN v_ini AND v_fim)
    OR EXISTS (SELECT 1 FROM public.cui_jornada180 j
                WHERE j.membro_id = p_membro_id AND j.deleted_at IS NULL
                  AND j.presente IS DISTINCT FROM false
                  AND j.data_encontro BETWEEN v_ini AND v_fim)
    OR EXISTS (SELECT 1 FROM public.cui_acompanhamentos a
                WHERE a.membro_id = p_membro_id
                  AND a.data_inicio BETWEEN v_ini AND v_fim)
  ) THEN v_sig := array_append(v_sig, 'investir'); END IF;

  -- SERVIR · voluntário ativo (membro_id · ±janela)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_voluntarios v
     WHERE v.membro_id = p_membro_id AND v.deleted_at IS NULL AND v.ate IS NULL
       AND v.desde BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'servir'); END IF;

  -- GENEROSIDADE · dízimo/oferta (membro_id · ±janela)
  IF p_membro_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mem_contribuicoes c
     WHERE c.membro_id = p_membro_id AND c.deleted_at IS NULL
       AND c.tipo IN ('dizimo', 'oferta')
       AND c.data BETWEEN v_ini AND v_fim
  ) THEN v_sig := array_append(v_sig, 'generosidade'); END IF;

  RETURN v_sig;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_nsm_sinais_engajados(uuid, text, text, date, int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. recalcular_nsm · numerador = convertidos com ≥1 sinal · denominador = coorte
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_nsm()
RETURNS TABLE (
  segmento_processado text,
  convertidos int,
  engajados int,
  percentual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seg RECORD;
  v_janela_inicio date := (current_date - interval '90 days')::date;
  v_janela_fim    date := current_date;
  v_ant_inicio    date := (current_date - interval '180 days')::date;
  v_ant_fim       date := (current_date - interval '90 days')::date;
  v_total_atual int; v_engajados_atual int; v_total_anterior int;
  v_pct_atual numeric; v_por_valor jsonb;
  v_area text;
BEGIN
  FOR seg IN SELECT * FROM public.nsm_estado WHERE ativo = true LOOP
    v_area := CASE
      WHEN seg.segmento_tipo = 'igreja_tipo' AND (seg.segmento_filtro->>'tipo') = 'online'
      THEN 'online' ELSE NULL END;

    -- DENOMINADOR = convertidos da coorte na janela (inclui órfãos sem membro_id,
    -- que nunca engajam até serem reconciliados · accountability da identidade).
    SELECT
      (SELECT COUNT(DISTINCT cv.membro_id) FROM public.cui_convertidos cv
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NOT NULL
           AND cv.data_culto BETWEEN v_janela_inicio AND v_janela_fim
           AND (v_area IS NULL OR cv.area = v_area))
    + (SELECT COUNT(*) FROM public.cui_convertidos cv
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NULL
           AND cv.data_culto BETWEEN v_janela_inicio AND v_janela_fim
           AND (v_area IS NULL OR cv.area = v_area))
    INTO v_total_atual;

    -- NUMERADOR = convertidos com ≥1 sinal de engajamento (±60d)
    SELECT COUNT(DISTINCT cv.membro_id) INTO v_engajados_atual
      FROM public.cui_convertidos cv
     WHERE cv.deleted_at IS NULL AND cv.membro_id IS NOT NULL
       AND cv.data_culto BETWEEN v_janela_inicio AND v_janela_fim
       AND (v_area IS NULL OR cv.area = v_area)
       AND cardinality(public.fn_nsm_sinais_engajados(cv.membro_id, cv.cpf, cv.nome, cv.data_culto, 60)) >= 1;

    -- Período anterior (mesma base · pro histórico/delta)
    SELECT
      (SELECT COUNT(DISTINCT cv.membro_id) FROM public.cui_convertidos cv
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NOT NULL
           AND cv.data_culto BETWEEN v_ant_inicio AND v_ant_fim
           AND (v_area IS NULL OR cv.area = v_area))
    + (SELECT COUNT(*) FROM public.cui_convertidos cv
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NULL
           AND cv.data_culto BETWEEN v_ant_inicio AND v_ant_fim
           AND (v_area IS NULL OR cv.area = v_area))
    INTO v_total_anterior;

    -- BREAKDOWN por VALOR (sinal → valor · distinct convertidos por valor)
    SELECT COALESCE(jsonb_object_agg(valor, qtd), '{}'::jsonb) INTO v_por_valor
      FROM (
        SELECT CASE s
                 WHEN 'batismo' THEN 'seguir' WHEN 'next' THEN 'seguir'
                 WHEN 'grupo' THEN 'conectar' WHEN 'investir' THEN 'investir'
                 WHEN 'servir' THEN 'servir' WHEN 'generosidade' THEN 'generosidade'
               END AS valor,
               COUNT(DISTINCT cv.membro_id) AS qtd
          FROM public.cui_convertidos cv
          CROSS JOIN LATERAL unnest(public.fn_nsm_sinais_engajados(cv.membro_id, cv.cpf, cv.nome, cv.data_culto, 60)) AS s
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NOT NULL
           AND cv.data_culto BETWEEN v_janela_inicio AND v_janela_fim
           AND (v_area IS NULL OR cv.area = v_area)
         GROUP BY 1
      ) sub;

    v_pct_atual := CASE WHEN v_total_atual > 0
                        THEN round((v_engajados_atual::numeric / v_total_atual) * 100, 2)
                        ELSE 0 END;

    UPDATE public.nsm_estado SET
      total_convertidos_periodo = v_total_atual,
      engajados_em_60d          = v_engajados_atual,
      percentual                = v_pct_atual,
      total_periodo_anterior    = v_total_anterior,
      delta_vs_mes_anterior     = v_pct_atual,
      por_valor                 = v_por_valor,
      janela_inicio             = v_janela_inicio,
      janela_fim                = v_janela_fim,
      atualizado_em             = now()
    WHERE segmento = seg.segmento;

    segmento_processado := seg.segmento;
    convertidos := v_total_atual; engajados := v_engajados_atual; percentual := v_pct_atual;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.recalcular_nsm() IS
  'NSM v3 = convertidos com ≥1 sinal de engajamento (fn_nsm_sinais_engajados, ±60d, casa por id/cpf/nome) ÷ convertidos da coorte (cui_convertidos, 90d). Sinais: batismo, next, grupo, investir, servir, generosidade (1º contato NÃO conta · é a janela de conversão).';

-- ----------------------------------------------------------------------------
-- 3. Gatilho leve (statement-level) em cui_convertidos → recalcula o NSM.
--    Só cui_convertidos (volume baixo) · NÃO nas tabelas de sinal de alto volume.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_trigger_recalcular_nsm()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.recalcular_nsm();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_cui_convertidos_recalc_nsm ON public.cui_convertidos;
CREATE TRIGGER tg_cui_convertidos_recalc_nsm
AFTER INSERT OR UPDATE OR DELETE ON public.cui_convertidos
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_trigger_recalcular_nsm();

-- ----------------------------------------------------------------------------
-- 4. Aposenta KPIs táticos manuais sem fonte (reversível · ativo=false).
--    AMI-06 (devocional no AMI · volta quando o módulo rodar) · SED-15 (staff ·
--    vira KPI próprio fora da estrutura de cultos).
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id IN ('AMI-06', 'SED-15');

-- ----------------------------------------------------------------------------
-- 5. Recalcula já com a nova lógica.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.recalcular_nsm();
  RAISE NOTICE 'NSM v3 recalculado · sinais de engajamento + coorte cui_convertidos.';
END $$;
