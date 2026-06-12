-- Closing Mensal Financeiro · congela transacoes do mes fechado
-- 2026-05-22 · audit + bloqueio de alteracao retroativa

CREATE TABLE IF NOT EXISTS fin_closing_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano int NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fechado_em timestamptz NOT NULL DEFAULT now(),
  fechado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reaberto_em timestamptz,
  reaberto_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reaberto_motivo text,
  -- Snapshot do DRE no fechamento (audit · imutavel)
  total_receita numeric(14, 2) NOT NULL,
  total_despesa numeric(14, 2) NOT NULL,
  resultado numeric(14, 2) NOT NULL,
  qtd_transacoes int NOT NULL,
  saldo_contas_fim numeric(14, 2),
  contas_pagar_pendentes int NOT NULL DEFAULT 0,
  contas_pagar_valor_pendente numeric(14, 2) NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

ALTER TABLE fin_closing_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_closing_mensal_service ON fin_closing_mensal;
CREATE POLICY fin_closing_mensal_service ON fin_closing_mensal
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fin_closing_mensal_read ON fin_closing_mensal;
CREATE POLICY fin_closing_mensal_read ON fin_closing_mensal FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.current_user_module_level('financeiro') >= 2);

-- Trigger · bloqueia INSERT/UPDATE/DELETE em fin_transacoes de mes fechado
CREATE OR REPLACE FUNCTION public.tg_bloquear_transacao_mes_fechado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_data date; v_fechado boolean;
BEGIN
  v_data := COALESCE(NEW.data_competencia, OLD.data_competencia);
  IF v_data IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT EXISTS (
    SELECT 1 FROM fin_closing_mensal
    WHERE ano = EXTRACT(YEAR FROM v_data)::int
      AND mes = EXTRACT(MONTH FROM v_data)::int
      AND reaberto_em IS NULL
  ) INTO v_fechado;
  IF v_fechado THEN
    RAISE EXCEPTION 'Mes % de % esta fechado · reabra antes de alterar transacoes desse periodo',
      EXTRACT(MONTH FROM v_data)::int, EXTRACT(YEAR FROM v_data)::int;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_bloquear_transacao_mes_fechado ON fin_transacoes;
CREATE TRIGGER tg_bloquear_transacao_mes_fechado
BEFORE INSERT OR UPDATE OR DELETE ON fin_transacoes
FOR EACH ROW EXECUTE FUNCTION tg_bloquear_transacao_mes_fechado();

CREATE OR REPLACE FUNCTION public.fechar_mes_financeiro(
  p_ano int, p_mes int, p_fechado_por uuid, p_observacao text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_receita numeric; v_despesa numeric; v_qtd int;
  v_saldo numeric; v_pagar int; v_pagar_val numeric;
  v_id uuid;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0),
    COUNT(*)
  INTO v_receita, v_despesa, v_qtd
  FROM fin_transacoes
  WHERE data_competencia BETWEEN v_inicio AND v_fim
    AND status != 'cancelado';

  SELECT COALESCE(SUM(saldo), 0) INTO v_saldo FROM fin_contas WHERE ativa = true;

  SELECT COUNT(*), COALESCE(SUM(valor), 0) INTO v_pagar, v_pagar_val
    FROM fin_contas_pagar
   WHERE status = 'pendente'
     AND data_vencimento BETWEEN v_inicio AND v_fim;

  INSERT INTO fin_closing_mensal (
    ano, mes, fechado_por, total_receita, total_despesa, resultado, qtd_transacoes,
    saldo_contas_fim, contas_pagar_pendentes, contas_pagar_valor_pendente, observacao
  )
  VALUES (
    p_ano, p_mes, p_fechado_por, v_receita, v_despesa, v_receita - v_despesa, v_qtd,
    v_saldo, v_pagar, v_pagar_val, p_observacao
  )
  ON CONFLICT (ano, mes) DO UPDATE SET
    fechado_em = now(), fechado_por = EXCLUDED.fechado_por,
    reaberto_em = NULL, reaberto_por = NULL, reaberto_motivo = NULL,
    total_receita = EXCLUDED.total_receita, total_despesa = EXCLUDED.total_despesa,
    resultado = EXCLUDED.resultado, qtd_transacoes = EXCLUDED.qtd_transacoes,
    saldo_contas_fim = EXCLUDED.saldo_contas_fim,
    contas_pagar_pendentes = EXCLUDED.contas_pagar_pendentes,
    contas_pagar_valor_pendente = EXCLUDED.contas_pagar_valor_pendente,
    observacao = EXCLUDED.observacao
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_mes_financeiro(
  p_ano int, p_mes int, p_reaberto_por uuid, p_motivo text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatorio (>=5 chars) pra reabrir mes';
  END IF;
  UPDATE fin_closing_mensal SET
    reaberto_em = now(), reaberto_por = p_reaberto_por, reaberto_motivo = p_motivo
  WHERE ano = p_ano AND mes = p_mes AND reaberto_em IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_mes_financeiro(int,int,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_mes_financeiro(int,int,uuid,text) TO authenticated, service_role;

COMMIT;
