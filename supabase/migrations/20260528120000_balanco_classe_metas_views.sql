-- Balanço histórico (2022-2026) · classe de movimento + views semanais + metas com periodicidade
-- Decisão Marcos 2026-05-28: empréstimos NUNCA contam como receita ordinária / arrecadação.
-- Idempotente.

-- ============================================================
-- 1. classe_movimento em fin_transacoes
-- ============================================================
-- 'ordinaria'      · dízimo, oferta, contribuição, evento, venda · entra em arrecadação
-- 'transferencia'  · 1.x · transferência interna entre caixa/conta · NÃO entra
-- 'emprestimo'     · 2.x ou texto detectado · NÃO entra em arrecadação
-- 'extraordinaria' · doação grande pontual · entra em receita extraordinária separada
-- 'estorno'        · estorno/devolução · NÃO entra
ALTER TABLE public.fin_transacoes
  ADD COLUMN IF NOT EXISTS classe_movimento text DEFAULT 'ordinaria'
    CHECK (classe_movimento IN ('ordinaria','transferencia','emprestimo','extraordinaria','estorno'));

CREATE INDEX IF NOT EXISTS idx_fin_transacoes_classe
  ON public.fin_transacoes (classe_movimento)
  WHERE classe_movimento <> 'ordinaria';

-- ============================================================
-- 2. Função pura · classifica linha do balanço por código + texto
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_classificar_movimento(
  p_codigo_pdc text,
  p_pdc_texto text,
  p_historico text,
  p_origem_destino text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  c text := COALESCE(trim(p_codigo_pdc), '');
  comb text := lower(coalesce(p_codigo_pdc,'') || ' ' || coalesce(p_pdc_texto,'') || ' ' || coalesce(p_historico,'') || ' ' || coalesce(p_origem_destino,''));
BEGIN
  -- Empréstimos · prioridade máxima (CLAUDE.md 2026-05-28)
  IF c LIKE '2.%' THEN RETURN 'emprestimo'; END IF;
  IF comb ~ '\memprest|\mmutuo|financiamento|captac|empr[ée]stimo' THEN RETURN 'emprestimo'; END IF;

  -- Transferências internas · ativo (1.x) ou texto começa com Transf.
  IF c LIKE '1.%' THEN RETURN 'transferencia'; END IF;
  IF comb ~ '^transf\.|transfer[eê]ncia' THEN RETURN 'transferencia'; END IF;

  -- Estornos / devoluções
  IF comb ~ 'estorno|devolu[çc][aã]o' THEN RETURN 'estorno'; END IF;

  -- Extraordinárias · doação acima de 15 mil identificada explicitamente
  IF comb ~ 'extraordin[áa]ri' THEN RETURN 'extraordinaria'; END IF;

  -- Default · ordinária (receita ou despesa normal)
  RETURN 'ordinaria';
END;
$$;

-- Backfill em transações existentes
UPDATE public.fin_transacoes t
SET classe_movimento = public.fin_classificar_movimento(
  pc.codigo,
  pc.nome,
  t.descricao,
  t.referencia
)
FROM public.fin_plano_contas pc
WHERE t.plano_contas_id = pc.id
  AND t.classe_movimento = 'ordinaria';

-- ============================================================
-- 3. balanco_importar_linha · atualizada para usar classe_movimento
-- ============================================================
CREATE OR REPLACE FUNCTION public.balanco_importar_linha(p_dados JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_codigo_legado BIGINT;
  v_plano_id UUID;
  v_centro_id UUID;
  v_grupo_id UUID;
  v_conta_id UUID;
  v_profile_id UUID;
  v_username TEXT;
  v_tipo TEXT;
  v_valor NUMERIC;
  v_classe TEXT;
BEGIN
  v_codigo_legado := (p_dados->>'codigo')::BIGINT;
  IF v_codigo_legado IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM fin_transacoes WHERE codigo_legado = v_codigo_legado;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_plano_id  := balanco_get_or_create_plano(p_dados->>'plano_codigo', p_dados->>'plano_nome');
  v_centro_id := balanco_get_or_create_centro(p_dados->>'centro_codigo', p_dados->>'centro_nome');
  v_grupo_id  := balanco_get_or_create_grupo(p_dados->>'grupo_movimento');
  v_conta_id  := balanco_get_or_create_conta(p_dados->>'conta_caixa');

  v_username := lower(trim(p_dados->>'username'));
  IF v_username IS NOT NULL AND length(v_username) > 0 THEN
    SELECT profile_id INTO v_profile_id FROM fin_user_legacy_map WHERE username_legacy = v_username LIMIT 1;
  END IF;

  v_tipo  := CASE WHEN upper(p_dados->>'tipo') = 'E' THEN 'receita' ELSE 'despesa' END;
  v_valor := abs((p_dados->>'valor')::NUMERIC);

  v_classe := fin_classificar_movimento(
    p_dados->>'plano_codigo',
    p_dados->>'plano_nome',
    p_dados->>'historico',
    p_dados->>'origem_destino'
  );

  INSERT INTO fin_transacoes (
    codigo_legado, tipo, valor, descricao, data_competencia,
    plano_contas_id, centro_custo_id, grupo_movimento_id, conta_id,
    forma_pagamento, referencia, lancado_por_nome, created_by,
    status, classe_movimento, created_at
  )
  VALUES (
    v_codigo_legado, v_tipo, v_valor,
    COALESCE(p_dados->>'historico', p_dados->>'origem_destino', '(sem descricao)'),
    (p_dados->>'data')::date,
    v_plano_id, v_centro_id, v_grupo_id, v_conta_id,
    p_dados->>'forma_pagamento', p_dados->>'origem_destino',
    v_username, v_profile_id,
    'conciliado', v_classe,
    COALESCE((p_dados->>'cadastro')::timestamptz, now())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- 4. balanco_importar_lote · processa array JSONB de uma vez (perf)
-- ============================================================
CREATE OR REPLACE FUNCTION public.balanco_importar_lote(p_linhas JSONB)
RETURNS TABLE(inseridas INT, ignoradas INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_linha JSONB;
  v_inseridas INT := 0;
  v_ignoradas INT := 0;
  v_id UUID;
BEGIN
  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_id := balanco_importar_linha(v_linha);
    IF v_id IS NULL THEN
      v_ignoradas := v_ignoradas + 1;
    ELSE
      -- Pode ser duplicado já existente · checa se foi de fato inserido nesta tx
      v_inseridas := v_inseridas + 1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_inseridas, v_ignoradas;
END;
$$;

-- ============================================================
-- 5. Views novas · arrecadação PURA (sem empréstimo/transferência/estorno)
-- ============================================================
DROP VIEW IF EXISTS public.vw_fin_arrecadacao_semanal CASCADE;
CREATE OR REPLACE VIEW public.vw_fin_arrecadacao_semanal AS
SELECT
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(t.data_competencia)).label AS semana_label,
  EXTRACT(YEAR FROM (fin_semana_qua_ter(t.data_competencia)).inicio)::int AS ano,
  -- Arrecadação = receita ordinária + extraordinária (NÃO empréstimo/transferência)
  SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END) AS receita,
  SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END) AS despesa,
  SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END)
    - SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END) AS resultado,
  -- Detalhamento separado
  SUM(CASE WHEN t.classe_movimento = 'emprestimo' THEN t.valor ELSE 0 END) AS movimento_emprestimo,
  SUM(CASE WHEN t.classe_movimento = 'transferencia' THEN t.valor ELSE 0 END) AS movimento_transferencia,
  COUNT(*) AS qtd
FROM fin_transacoes t
WHERE t.status != 'cancelado'
GROUP BY semana_inicio, semana_fim, semana_label, ano;

DROP VIEW IF EXISTS public.vw_fin_arrecadacao_mensal CASCADE;
CREATE OR REPLACE VIEW public.vw_fin_arrecadacao_mensal AS
SELECT
  to_char(t.data_competencia, 'YYYY-MM') AS mes,
  EXTRACT(YEAR FROM t.data_competencia)::int AS ano,
  EXTRACT(MONTH FROM t.data_competencia)::int AS mes_num,
  SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END) AS receita,
  SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END) AS despesa,
  SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END)
    - SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END) AS resultado,
  COUNT(*) AS qtd
FROM fin_transacoes t
WHERE t.status != 'cancelado'
GROUP BY mes, ano, mes_num;

-- ============================================================
-- 6. View nova · Frequência × Arrecadação SEMANAL (qua-ter)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_fin_freq_vs_arrecadacao_semanal AS
WITH semanas_arrec AS (
  SELECT semana_inicio, semana_fim, semana_label, ano, receita, despesa, resultado, qtd
  FROM vw_fin_arrecadacao_semanal
),
semanas_freq AS (
  SELECT
    (fin_semana_qua_ter(c.data)).inicio AS semana_inicio,
    SUM(COALESCE(c.presencial_adulto, 0) + COALESCE(c.presencial_kids, 0)) AS presencial,
    SUM(COALESCE(c.online_pico, 0)) AS online,
    SUM(COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0) + COALESCE(c.decisoes_kids, 0)) AS decisoes,
    COUNT(*) AS qtd_cultos
  FROM cultos c
  WHERE c.deleted_at IS NULL
  GROUP BY semana_inicio
)
SELECT
  COALESCE(a.semana_inicio, f.semana_inicio) AS semana_inicio,
  a.semana_fim,
  a.semana_label,
  a.ano,
  COALESCE(a.receita, 0) AS receita,
  COALESCE(a.despesa, 0) AS despesa,
  COALESCE(a.resultado, 0) AS resultado,
  COALESCE(f.presencial, 0) AS presencial,
  COALESCE(f.online, 0) AS online,
  COALESCE(f.presencial, 0) + COALESCE(f.online, 0) AS total_freq,
  COALESCE(f.decisoes, 0) AS decisoes,
  COALESCE(f.qtd_cultos, 0) AS qtd_cultos,
  CASE
    WHEN COALESCE(f.presencial, 0) > 0
    THEN COALESCE(a.receita, 0) / f.presencial
    ELSE 0
  END AS ticket_medio_presencial
FROM semanas_arrec a
FULL OUTER JOIN semanas_freq f ON f.semana_inicio = a.semana_inicio;

-- ============================================================
-- 7. fin_metas · novos tipos + periodicidade
-- ============================================================
-- Drop qualquer CHECK constraint antigo em tipo + recria com novos valores · idempotente
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'fin_metas'
      AND t.relnamespace = 'public'::regnamespace
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo%IN%'
  LOOP
    EXECUTE format('ALTER TABLE public.fin_metas DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.fin_metas
  ADD CONSTRAINT fin_metas_tipo_check CHECK (tipo IN (
    'receita_semanal',
    'receita_mensal',
    'receita_anual',
    'despesa_max_semanal',
    'despesa_max_mensal',
    'despesa_max_anual',
    'saldo_minimo',
    'pct_categoria',
    'meta_centro_custo'
  ));

-- Periodicidade explícita (semanal/mensal/anual/customizado)
ALTER TABLE public.fin_metas
  ADD COLUMN IF NOT EXISTS periodicidade text DEFAULT 'mensal'
    CHECK (periodicidade IN ('semanal', 'mensal', 'anual', 'customizado'));

-- Backfill periodicidade baseado em tipo legado
UPDATE public.fin_metas SET periodicidade = 'semanal'
  WHERE tipo IN ('receita_semanal','despesa_max_semanal') AND periodicidade = 'mensal';
UPDATE public.fin_metas SET periodicidade = 'anual'
  WHERE tipo IN ('receita_anual','despesa_max_anual') AND periodicidade = 'mensal';

-- ============================================================
-- 8. RPC · progresso de uma meta no período
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_metas_progresso(
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL
)
RETURNS TABLE(
  meta_id uuid,
  tipo text,
  periodicidade text,
  descricao text,
  valor_meta numeric,
  valor_atual numeric,
  pct numeric,
  periodo_inicio date,
  periodo_fim date
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hoje date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH metas_periodo AS (
    SELECT
      m.id,
      m.tipo,
      m.periodicidade,
      m.descricao,
      m.valor::numeric AS valor_meta,
      m.plano_contas_id,
      m.centro_custo_id,
      m.ano,
      m.mes_inicio,
      m.mes_fim,
      m.ativa,
      -- Define janela efetiva
      CASE
        WHEN p_inicio IS NOT NULL THEN p_inicio
        WHEN m.periodicidade = 'semanal' THEN (fin_semana_qua_ter(v_hoje)).inicio
        WHEN m.periodicidade = 'mensal'  THEN date_trunc('month', v_hoje)::date
        WHEN m.periodicidade = 'anual'   THEN make_date(COALESCE(m.ano, EXTRACT(YEAR FROM v_hoje)::int), 1, 1)
        ELSE date_trunc('month', v_hoje)::date
      END AS p_ini,
      CASE
        WHEN p_fim IS NOT NULL THEN p_fim
        WHEN m.periodicidade = 'semanal' THEN (fin_semana_qua_ter(v_hoje)).fim
        WHEN m.periodicidade = 'mensal'  THEN (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date
        WHEN m.periodicidade = 'anual'   THEN make_date(COALESCE(m.ano, EXTRACT(YEAR FROM v_hoje)::int), 12, 31)
        ELSE (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date
      END AS p_end
    FROM fin_metas m
    WHERE m.ativa = true
  ),
  agg AS (
    SELECT
      mp.id,
      CASE
        WHEN mp.tipo LIKE 'receita_%' THEN
          COALESCE(SUM(CASE WHEN t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END), 0)
        WHEN mp.tipo LIKE 'despesa_%' THEN
          COALESCE(SUM(CASE WHEN t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria') THEN t.valor ELSE 0 END), 0)
        WHEN mp.tipo = 'saldo_minimo' THEN
          COALESCE(SUM(CASE WHEN t.tipo='receita' THEN t.valor ELSE -t.valor END), 0)
        WHEN mp.tipo = 'meta_centro_custo' THEN
          COALESCE(SUM(t.valor) FILTER (WHERE t.centro_custo_id = mp.centro_custo_id), 0)
        ELSE 0
      END AS atual
    FROM metas_periodo mp
    LEFT JOIN fin_transacoes t
      ON t.data_competencia BETWEEN mp.p_ini AND mp.p_end
      AND t.status != 'cancelado'
      AND (mp.plano_contas_id IS NULL OR t.plano_contas_id = mp.plano_contas_id)
    GROUP BY mp.id, mp.tipo, mp.centro_custo_id
  )
  SELECT
    mp.id,
    mp.tipo,
    mp.periodicidade,
    mp.descricao,
    mp.valor_meta,
    a.atual,
    CASE WHEN mp.valor_meta > 0 THEN (a.atual / mp.valor_meta) * 100 ELSE 0 END,
    mp.p_ini,
    mp.p_end
  FROM metas_periodo mp
  JOIN agg a ON a.id = mp.id
  ORDER BY mp.periodicidade, mp.tipo, mp.descricao;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_metas_progresso TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_classificar_movimento TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.balanco_importar_lote TO service_role;

COMMIT;
