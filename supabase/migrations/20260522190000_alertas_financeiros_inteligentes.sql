-- Alertas Financeiros Inteligentes · cron diario popula fin_alertas
-- 2026-05-22
--
-- 7 tipos de anomalia detectados:
--   1. conta_vencida · contas a pagar com data < hoje
--   2. conta_vencendo · vencendo nos proximos 3 dias
--   3. saldo_baixo · conta com saldo < R$ 5k (critico se negativo)
--   4. despesa_atipica · plano de contas com soma do mes >50% acima media 6m
--   5. receita_baixa · mes atual <70% proporcional da media 6m
--   6. doador_parou · membro sem doar ha 60-120d (acao pastoral)
--   7. saldo_projetado_negativo · vw_projecao_caixa_mensal negativa
--
-- Idempotente · funcao criar_alerta_financeiro() skip se ja existe
-- alerta aberto com mesma chave_dedup

CREATE OR REPLACE VIEW public.vw_fin_alertas_abertos AS
SELECT a.*,
  CASE a.severidade
    WHEN 'critico' THEN 4 WHEN 'alerta' THEN 3
    WHEN 'aviso' THEN 2 WHEN 'info' THEN 1 ELSE 0
  END AS prioridade
FROM fin_alertas a
WHERE a.atendido_em IS NULL
ORDER BY prioridade DESC, a.created_at DESC;

CREATE OR REPLACE FUNCTION public.criar_alerta_financeiro(
  p_tipo text, p_severidade text, p_titulo text, p_mensagem text,
  p_chave_dedup text, p_dados jsonb DEFAULT NULL,
  p_recorrencia_id uuid DEFAULT NULL, p_membro_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM fin_alertas
   WHERE chave_dedup = p_chave_dedup AND atendido_em IS NULL LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;
  INSERT INTO fin_alertas (tipo, severidade, titulo, mensagem, chave_dedup, dados, recorrencia_id, membro_id)
  VALUES (p_tipo, p_severidade, p_titulo, p_mensagem, p_chave_dedup, p_dados, p_recorrencia_id, p_membro_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_alertas_financeiros()
RETURNS TABLE (tipo text, qtd_criados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; n int;
BEGIN
  -- Tipo 1 · contas vencidas
  n := 0;
  FOR r IN SELECT id, descricao, valor, data_vencimento, fornecedor FROM fin_contas_pagar
           WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE
  LOOP
    PERFORM criar_alerta_financeiro('conta_vencida', 'critico',
      format('Conta vencida · %s', r.descricao),
      format('R$ %s · venceu em %s%s', TO_CHAR(r.valor, 'FM999,999,990.00'),
        TO_CHAR(r.data_vencimento, 'DD/MM/YYYY'),
        CASE WHEN r.fornecedor IS NOT NULL THEN format(' · %s', r.fornecedor) ELSE '' END),
      format('conta_vencida_%s', r.id),
      jsonb_build_object('conta_pagar_id', r.id, 'valor', r.valor));
    n := n + 1;
  END LOOP;
  tipo := 'conta_vencida'; qtd_criados := n; RETURN NEXT;

  -- Tipo 2 · vencendo em 3 dias
  n := 0;
  FOR r IN SELECT id, descricao, valor, data_vencimento, fornecedor FROM fin_contas_pagar
           WHERE status = 'pendente'
             AND data_vencimento >= CURRENT_DATE
             AND data_vencimento <= CURRENT_DATE + interval '3 days'
  LOOP
    PERFORM criar_alerta_financeiro('conta_vencendo', 'alerta',
      format('Vence em %s · %s',
        CASE WHEN r.data_vencimento = CURRENT_DATE THEN 'HOJE'
             WHEN r.data_vencimento = CURRENT_DATE + 1 THEN 'amanhã'
             ELSE format('%s dias', r.data_vencimento - CURRENT_DATE) END,
        r.descricao),
      format('R$ %s · %s', TO_CHAR(r.valor, 'FM999,999,990.00'),
        COALESCE(r.fornecedor, r.descricao)),
      format('conta_vencendo_%s_%s', r.id, r.data_vencimento),
      jsonb_build_object('conta_pagar_id', r.id, 'valor', r.valor, 'data_vencimento', r.data_vencimento));
    n := n + 1;
  END LOOP;
  tipo := 'conta_vencendo'; qtd_criados := n; RETURN NEXT;

  -- Tipo 3 · saldo baixo
  n := 0;
  FOR r IN SELECT nome, saldo FROM fin_contas WHERE ativa = true AND saldo < 5000
  LOOP
    PERFORM criar_alerta_financeiro('saldo_baixo',
      CASE WHEN r.saldo < 0 THEN 'critico' ELSE 'alerta' END,
      format('Saldo baixo · %s', r.nome),
      format('Saldo atual: R$ %s', TO_CHAR(r.saldo, 'FM999,999,990.00')),
      format('saldo_baixo_%s_%s', r.nome, TO_CHAR(CURRENT_DATE, 'YYYYMMDD')),
      jsonb_build_object('conta', r.nome, 'saldo', r.saldo));
    n := n + 1;
  END LOOP;
  tipo := 'saldo_baixo'; qtd_criados := n; RETURN NEXT;

  -- Tipo 4 · despesa atipica
  n := 0;
  FOR r IN
    WITH media_6m AS (
      SELECT plano_contas_id, AVG(soma) AS media FROM (
        SELECT plano_contas_id, date_trunc('month', data_competencia) AS mes, SUM(valor) AS soma
          FROM fin_transacoes
         WHERE tipo = 'despesa' AND status != 'cancelado'
           AND plano_contas_id IS NOT NULL
           AND data_competencia >= date_trunc('month', CURRENT_DATE - interval '6 months')
           AND data_competencia < date_trunc('month', CURRENT_DATE)
         GROUP BY plano_contas_id, mes
      ) sub GROUP BY plano_contas_id HAVING AVG(soma) > 100
    ),
    mes_atual AS (
      SELECT plano_contas_id, SUM(valor) AS soma_mes FROM fin_transacoes
       WHERE tipo = 'despesa' AND status != 'cancelado'
         AND data_competencia >= date_trunc('month', CURRENT_DATE)
       GROUP BY plano_contas_id
    )
    SELECT ma.plano_contas_id, ma.soma_mes, m.media, pc.nome AS plano_nome, pc.codigo
      FROM mes_atual ma
      JOIN media_6m m ON m.plano_contas_id = ma.plano_contas_id
      LEFT JOIN fin_plano_contas pc ON pc.id = ma.plano_contas_id
     WHERE ma.soma_mes > m.media * 1.5
  LOOP
    PERFORM criar_alerta_financeiro('despesa_atipica', 'aviso',
      format('Despesa atípica · %s', COALESCE(r.plano_nome, 'sem categoria')),
      format('Mês atual: R$ %s · média 6m: R$ %s · %s%% acima',
        TO_CHAR(r.soma_mes, 'FM999,999,990.00'),
        TO_CHAR(r.media, 'FM999,999,990.00'),
        ROUND(((r.soma_mes - r.media) / r.media) * 100)),
      format('despesa_atipica_%s_%s', r.plano_contas_id, TO_CHAR(CURRENT_DATE, 'YYYYMM')),
      jsonb_build_object('plano_contas_id', r.plano_contas_id, 'soma_mes', r.soma_mes, 'media_6m', r.media));
    n := n + 1;
  END LOOP;
  tipo := 'despesa_atipica'; qtd_criados := n; RETURN NEXT;

  -- Tipo 5 · receita baixa (apos dia 15)
  n := 0;
  IF EXTRACT(DAY FROM CURRENT_DATE) > 15 THEN
    DECLARE v_media numeric; v_atual numeric; v_dias_d int; v_dias_t int;
            v_prop numeric; v_pct numeric;
    BEGIN
      SELECT AVG(soma) INTO v_media FROM (
        SELECT SUM(valor) AS soma FROM fin_transacoes
         WHERE tipo = 'receita' AND status != 'cancelado'
           AND data_competencia >= CURRENT_DATE - interval '6 months'
           AND data_competencia < date_trunc('month', CURRENT_DATE)
         GROUP BY date_trunc('month', data_competencia)
      ) sub;
      SELECT COALESCE(SUM(valor), 0) INTO v_atual FROM fin_transacoes
       WHERE tipo = 'receita' AND status != 'cancelado'
         AND data_competencia >= date_trunc('month', CURRENT_DATE);
      v_dias_d := EXTRACT(DAY FROM CURRENT_DATE)::int;
      v_dias_t := EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::int;
      v_prop := v_media * (v_dias_d::numeric / v_dias_t);
      IF v_media > 1000 AND v_prop > 0 AND v_atual < v_prop * 0.7 THEN
        v_pct := ROUND(((v_atual - v_prop) / v_prop) * 100);
        PERFORM criar_alerta_financeiro('receita_baixa', 'alerta',
          format('Receita do mês %s%% abaixo do esperado', v_pct),
          format('Atual: R$ %s até dia %s · esperado: R$ %s · média 6m: R$ %s',
            TO_CHAR(v_atual, 'FM999,999,990.00'), v_dias_d,
            TO_CHAR(v_prop, 'FM999,999,990.00'),
            TO_CHAR(v_media, 'FM999,999,990.00')),
          format('receita_baixa_%s', TO_CHAR(CURRENT_DATE, 'YYYYMM')),
          jsonb_build_object('atual', v_atual, 'esperado', v_prop, 'media', v_media));
        n := 1;
      END IF;
    END;
  END IF;
  tipo := 'receita_baixa'; qtd_criados := n; RETURN NEXT;

  -- Tipo 6 · doador parou
  n := 0;
  FOR r IN SELECT membro_id, nome, dias_inativo, valor_total
             FROM vw_doadores_pararam
            WHERE dias_inativo BETWEEN 60 AND 120 LIMIT 20
  LOOP
    PERFORM criar_alerta_financeiro('doador_parou', 'aviso',
      format('Doador parou · %s', r.nome),
      format('Sem doar há %s dias · histórico de R$ %s',
        r.dias_inativo, TO_CHAR(r.valor_total, 'FM999,999,990.00')),
      format('doador_parou_%s_%s', r.membro_id, TO_CHAR(CURRENT_DATE, 'YYYYMM')),
      jsonb_build_object('membro_id', r.membro_id, 'dias_inativo', r.dias_inativo),
      NULL, r.membro_id);
    n := n + 1;
  END LOOP;
  tipo := 'doador_parou'; qtd_criados := n; RETURN NEXT;

  -- Tipo 7 · saldo projetado negativo
  n := 0;
  FOR r IN SELECT mes_label, mes_inicio, saldo_projetado
             FROM vw_projecao_caixa_mensal
            WHERE saldo_projetado < 0 ORDER BY mes_inicio LIMIT 3
  LOOP
    PERFORM criar_alerta_financeiro('saldo_projetado_negativo', 'alerta',
      format('Saldo negativo previsto em %s', r.mes_label),
      format('Projeção: R$ %s · revisar despesas ou planejar captação',
        TO_CHAR(r.saldo_projetado, 'FM999,999,990.00')),
      format('proj_neg_%s', TO_CHAR(r.mes_inicio, 'YYYYMM')),
      jsonb_build_object('mes', r.mes_inicio, 'saldo_projetado', r.saldo_projetado));
    n := n + 1;
  END LOOP;
  tipo := 'saldo_projetado_negativo'; qtd_criados := n; RETURN NEXT;
END;
$$;

GRANT SELECT ON public.vw_fin_alertas_abertos TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_alertas_financeiros() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_alerta_financeiro(text,text,text,text,text,jsonb,uuid,uuid) TO service_role;

ALTER TABLE fin_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_alertas_service ON fin_alertas;
CREATE POLICY fin_alertas_service ON fin_alertas FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fin_alertas_read ON fin_alertas;
CREATE POLICY fin_alertas_read ON fin_alertas FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.current_user_module_level('financeiro') >= 2);

COMMIT;
