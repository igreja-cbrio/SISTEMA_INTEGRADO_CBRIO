-- Despesas recorrentes · geracao automatica + projecao de caixa
-- 2026-05-22 · PR 1/3 do pacote financeiro

ALTER TABLE fin_despesas_recorrentes
  ADD COLUMN IF NOT EXISTS dia_vencimento int CHECK (dia_vencimento BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES fin_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS gera_n_dias_antes int NOT NULL DEFAULT 7;

ALTER TABLE fin_contas_pagar
  ADD COLUMN IF NOT EXISTS recorrente_id uuid REFERENCES fin_despesas_recorrentes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fin_contas_pagar_recorrente_idx
  ON fin_contas_pagar (recorrente_id, data_vencimento) WHERE recorrente_id IS NOT NULL;

-- Gera contas a pagar das recorrentes ativas + confirmadas que entram na janela
CREATE OR REPLACE FUNCTION public.gerar_contas_pagar_recorrentes(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (recorrente_id uuid, descricao text, data_vencimento date, valor numeric, acao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_data_venc date;
  v_existe boolean;
BEGIN
  FOR r IN
    SELECT * FROM fin_despesas_recorrentes WHERE ativa = true AND confirmada = true
  LOOP
    IF r.dia_vencimento IS NOT NULL THEN
      v_data_venc := make_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::int,
        EXTRACT(MONTH FROM CURRENT_DATE)::int,
        LEAST(r.dia_vencimento, EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::int)
      );
      IF v_data_venc < CURRENT_DATE THEN v_data_venc := v_data_venc + interval '1 month'; END IF;
    ELSE
      v_data_venc := COALESCE(r.proxima_estimada, CURRENT_DATE + (r.cadencia_dias || ' days')::interval);
    END IF;

    IF v_data_venc > CURRENT_DATE + (r.gera_n_dias_antes || ' days')::interval THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM fin_contas_pagar
      WHERE recorrente_id = r.id
        AND date_trunc('month', data_vencimento) = date_trunc('month', v_data_venc)
        AND status != 'cancelado'
    ) INTO v_existe;

    IF v_existe THEN
      recorrente_id := r.id; descricao := r.descricao;
      data_vencimento := v_data_venc; valor := r.valor_medio; acao := 'ja_existe';
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO fin_contas_pagar (
      descricao, fornecedor, categoria_id, valor, data_vencimento,
      conta_id, status, recorrente_id, created_by
    )
    VALUES (
      r.descricao, COALESCE(r.fornecedor, r.descricao),
      r.plano_contas_id, r.valor_medio, v_data_venc,
      r.conta_id, 'pendente', r.id, p_user_id
    );

    UPDATE fin_despesas_recorrentes
       SET ultima_ocorrencia = v_data_venc,
           proxima_estimada = v_data_venc + (r.cadencia_dias || ' days')::interval,
           ocorrencias = ocorrencias + 1
     WHERE id = r.id;

    recorrente_id := r.id; descricao := r.descricao;
    data_vencimento := v_data_venc; valor := r.valor_medio; acao := 'criado';
    RETURN NEXT;
  END LOOP;
END;
$$;

-- View · projecao de caixa proximos 6 meses
CREATE OR REPLACE VIEW public.vw_projecao_caixa_mensal AS
WITH meses AS (
  SELECT (date_trunc('month', CURRENT_DATE) + (n || ' month')::interval)::date AS mes_inicio,
         (date_trunc('month', CURRENT_DATE) + ((n+1) || ' month')::interval - interval '1 day')::date AS mes_fim,
         n AS offset_meses
    FROM generate_series(0, 5) n
),
receita_media AS (
  SELECT AVG(soma) AS receita_estimada
    FROM (
      SELECT date_trunc('month', data_competencia) AS mes, SUM(valor) AS soma
        FROM fin_transacoes
       WHERE tipo = 'receita' AND status != 'cancelado'
         AND data_competencia >= CURRENT_DATE - interval '6 months'
         AND data_competencia < date_trunc('month', CURRENT_DATE)
       GROUP BY 1
    ) sub
),
despesas_confirmadas AS (
  SELECT date_trunc('month', data_vencimento)::date AS mes, SUM(valor) AS total
    FROM fin_contas_pagar
   WHERE status = 'pendente'
     AND data_vencimento >= date_trunc('month', CURRENT_DATE)
     AND data_vencimento < date_trunc('month', CURRENT_DATE) + interval '6 months'
   GROUP BY 1
),
recorrentes_estimadas AS (
  SELECT date_trunc('month', proxima_estimada)::date AS mes, SUM(valor_medio) AS total
    FROM fin_despesas_recorrentes
   WHERE ativa = true AND confirmada = true
     AND proxima_estimada >= date_trunc('month', CURRENT_DATE)
     AND proxima_estimada < date_trunc('month', CURRENT_DATE) + interval '6 months'
   GROUP BY 1
),
saldo_atual AS (SELECT SUM(saldo) AS s FROM fin_contas WHERE ativa = true)
SELECT
  m.mes_inicio, m.mes_fim, m.offset_meses,
  TO_CHAR(m.mes_inicio, 'TMMon/YY') AS mes_label,
  (SELECT receita_estimada FROM receita_media) AS receita_estimada,
  COALESCE(d.total, 0) AS despesa_confirmada,
  COALESCE(r.total, 0) AS despesa_recorrente,
  (SELECT s FROM saldo_atual) AS saldo_inicial,
  (SELECT s FROM saldo_atual)
    + ((m.offset_meses + 1) * COALESCE((SELECT receita_estimada FROM receita_media), 0))
    - (SELECT COALESCE(SUM(d2.total), 0) FROM despesas_confirmadas d2 WHERE d2.mes <= m.mes_inicio)
    - (SELECT COALESCE(SUM(r2.total), 0) FROM recorrentes_estimadas r2 WHERE r2.mes <= m.mes_inicio)
    AS saldo_projetado
  FROM meses m
  LEFT JOIN despesas_confirmadas d ON d.mes = m.mes_inicio
  LEFT JOIN recorrentes_estimadas r ON r.mes = m.mes_inicio
 ORDER BY m.mes_inicio;

ALTER TABLE fin_despesas_recorrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_despesas_recorrentes_service ON fin_despesas_recorrentes;
CREATE POLICY fin_despesas_recorrentes_service ON fin_despesas_recorrentes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fin_despesas_recorrentes_read ON fin_despesas_recorrentes;
CREATE POLICY fin_despesas_recorrentes_read ON fin_despesas_recorrentes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.current_user_module_level('financeiro') >= 2);

GRANT EXECUTE ON FUNCTION public.gerar_contas_pagar_recorrentes(uuid) TO authenticated, service_role;
GRANT SELECT ON public.vw_projecao_caixa_mensal TO authenticated, service_role;

COMMIT;
