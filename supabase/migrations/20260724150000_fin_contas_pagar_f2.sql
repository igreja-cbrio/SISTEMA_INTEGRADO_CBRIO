-- Contas a Pagar · Fase 2 da reforma do Financeiro
--
-- Pedidos da gestão: ao clicar numa conta a pagar, poder (a) marcar que é
-- recorrente e (b) marcar que é salário apontando o colaborador do RH — o
-- valor passa a ser puxado de rh_funcionarios.salario (no cadastro e a cada
-- geração mensal da recorrência · mudou o salário no RH, o mês seguinte já
-- reflete).
--
-- Migration ADITIVA + idempotente. NÃO remove nada.

-- ── 1. Colunas novas · fin_contas_pagar ─────────────────────────────
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS eh_salario boolean DEFAULT false;
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS funcionario_id uuid REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fin_contas_pagar.eh_salario IS
  'Conta de salário: valor puxado de rh_funcionarios.salario do funcionario_id';
COMMENT ON COLUMN public.fin_contas_pagar.funcionario_id IS
  'Colaborador do RH quando eh_salario=true (fonte do valor)';

-- ── 2. Colunas novas · fin_despesas_recorrentes ─────────────────────
ALTER TABLE public.fin_despesas_recorrentes
  ADD COLUMN IF NOT EXISTS eh_salario boolean DEFAULT false;
ALTER TABLE public.fin_despesas_recorrentes
  ADD COLUMN IF NOT EXISTS funcionario_id uuid REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL;
ALTER TABLE public.fin_despesas_recorrentes
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES public.fin_centros_custo(id);

COMMENT ON COLUMN public.fin_despesas_recorrentes.eh_salario IS
  'Recorrência de salário: cada conta gerada usa rh_funcionarios.salario ATUAL do funcionario_id';
COMMENT ON COLUMN public.fin_despesas_recorrentes.funcionario_id IS
  'Colaborador do RH quando eh_salario=true (fonte do valor na geração)';
COMMENT ON COLUMN public.fin_despesas_recorrentes.centro_custo_id IS
  'Centro de custo propagado pras contas a pagar geradas pela recorrência';

-- ── 3. Geração de contas a pagar pelas recorrentes (substitui a v. 20260522160000)
--
-- Mudanças nesta versão:
--   · propaga centro_custo_id / eh_salario / funcionario_id pra conta criada;
--   · quando eh_salario + funcionario_id → valor da conta = rh_funcionarios.salario
--     ATUAL (puxa na hora da geração · fallback pro valor_medio se salário nulo);
--   · FIX: a versão anterior gravava r.plano_contas_id na coluna categoria_id
--     (legada) — agora vai pra plano_contas_id, que é a coluna certa.
CREATE OR REPLACE FUNCTION public.gerar_contas_pagar_recorrentes(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (recorrente_id uuid, descricao text, data_vencimento date, valor numeric, acao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_data_venc date;
  v_existe boolean;
  v_valor numeric;
  v_salario numeric;
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

    -- Valor: salário ATUAL do RH quando é recorrência de salário
    v_valor := r.valor_medio;
    IF COALESCE(r.eh_salario, false) AND r.funcionario_id IS NOT NULL THEN
      SELECT f.salario INTO v_salario
        FROM rh_funcionarios f
       WHERE f.id = r.funcionario_id AND f.deleted_at IS NULL;
      IF v_salario IS NOT NULL AND v_salario > 0 THEN
        v_valor := v_salario;
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM fin_contas_pagar cp
      WHERE cp.recorrente_id = r.id
        AND date_trunc('month', cp.data_vencimento) = date_trunc('month', v_data_venc)
        AND cp.status != 'cancelado'
    ) INTO v_existe;

    IF v_existe THEN
      recorrente_id := r.id; descricao := r.descricao;
      data_vencimento := v_data_venc; valor := v_valor; acao := 'ja_existe';
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO fin_contas_pagar (
      descricao, fornecedor, plano_contas_id, centro_custo_id, valor,
      data_vencimento, conta_id, status, recorrente_id,
      eh_salario, funcionario_id, origem, created_by
    )
    VALUES (
      r.descricao, COALESCE(r.fornecedor, r.descricao),
      r.plano_contas_id, r.centro_custo_id, v_valor,
      v_data_venc, r.conta_id, 'pendente', r.id,
      COALESCE(r.eh_salario, false), r.funcionario_id, 'recorrente', p_user_id
    );

    UPDATE fin_despesas_recorrentes
       SET ultima_ocorrencia = v_data_venc,
           proxima_estimada = v_data_venc + (r.cadencia_dias || ' days')::interval,
           ocorrencias = ocorrencias + 1
     WHERE id = r.id;

    recorrente_id := r.id; descricao := r.descricao;
    data_vencimento := v_data_venc; valor := v_valor; acao := 'criado';
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_contas_pagar_recorrentes(uuid) TO authenticated, service_role;
