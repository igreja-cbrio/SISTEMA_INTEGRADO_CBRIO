-- ============================================================================
-- 1) Drilldown de despesas · lista lancamentos por prefixo de codigo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fin_despesas_detalhe(p_inicio DATE, p_fim DATE, p_prefixo TEXT)
RETURNS TABLE (
  id UUID, data_competencia DATE, descricao TEXT, valor NUMERIC,
  plano_codigo TEXT, plano_nome TEXT,
  centro_codigo TEXT, centro_nome TEXT,
  conta_nome TEXT, referencia TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.id, t.data_competencia, t.descricao, t.valor,
    pc.codigo, pc.nome,
    cc.codigo, cc.nome,
    c.nome, t.referencia
  FROM fin_transacoes t
  JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  LEFT JOIN fin_centros_custo cc ON cc.id = t.centro_custo_id
  LEFT JOIN fin_contas c ON c.id = t.conta_id
  WHERE t.data_competencia >= p_inicio AND t.data_competencia <= p_fim
    AND t.status <> 'cancelado'
    AND t.tipo = 'despesa'
    AND pc.codigo LIKE (p_prefixo || '%')
  ORDER BY t.valor DESC
$$;

-- ============================================================================
-- 2) Link de transacao a funcionario (salario/beneficios) + aprendizado
-- ============================================================================
ALTER TABLE public.fin_transacoes
  ADD COLUMN IF NOT EXISTS funcionario_id UUID
    REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_transacoes_funcionario
  ON public.fin_transacoes (funcionario_id) WHERE funcionario_id IS NOT NULL;

COMMENT ON COLUMN public.fin_transacoes.funcionario_id IS
  'Funcionario associado quando a despesa é salário/benefício. Cruzar folha RH com pagamentos reais.';

ALTER TABLE public.fin_memoria_classificacao
  ADD COLUMN IF NOT EXISTS funcionario_id UUID
    REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL;

-- Match de funcionario por memo/contraparte (usa pg_trgm idealmente, mas
-- aqui usamos LIKE com unaccent · simples e funciona pra ~30 funcionarios).
CREATE OR REPLACE FUNCTION public.fin_match_funcionario_por_texto(p_texto TEXT)
RETURNS TABLE (funcionario_id UUID, nome TEXT, salario NUMERIC, confianca NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_texto_norm TEXT;
BEGIN
  IF p_texto IS NULL OR length(trim(p_texto)) < 5 THEN RETURN; END IF;
  v_texto_norm := lower(unaccent(p_texto));

  RETURN QUERY
  SELECT f.id, f.nome, f.salario,
    CASE
      WHEN f.cpf IS NOT NULL AND p_texto LIKE '%' || f.cpf || '%' THEN 0.99
      WHEN v_texto_norm LIKE '%' || lower(unaccent(f.nome)) || '%' THEN 0.95
      ELSE 0.80
    END AS confianca
  FROM rh_funcionarios f
  WHERE f.status = 'ativo'
    AND (
      v_texto_norm LIKE '%' || lower(unaccent(f.nome)) || '%'
      OR (f.cpf IS NOT NULL AND p_texto LIKE '%' || f.cpf || '%')
    )
  ORDER BY confianca DESC
  LIMIT 1;
END;
$$;

-- Busca funcionarios por nome · usada pelo autocomplete de "É salário"
CREATE OR REPLACE FUNCTION public.fin_buscar_funcionarios(p_query TEXT)
RETURNS TABLE (id UUID, nome TEXT, cargo TEXT, area TEXT, salario NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.id, f.nome, f.cargo, f.area, f.salario
  FROM rh_funcionarios f
  WHERE f.status = 'ativo'
    AND (
      p_query IS NULL OR p_query = ''
      OR lower(unaccent(f.nome)) LIKE '%' || lower(unaccent(p_query)) || '%'
    )
  ORDER BY f.nome
  LIMIT 30
$$;
