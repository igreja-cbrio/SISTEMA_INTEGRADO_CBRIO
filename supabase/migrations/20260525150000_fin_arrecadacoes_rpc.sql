-- Lista arrecadacoes (plano 3.01.*) no periodo · agregacao no banco
-- Resolve PostgREST db-max-rows=1000 que cortava listagens de meses com muitas
-- contribuicoes (ex: maio/26 com 1905 lancamentos mostrava só 927).
DROP FUNCTION IF EXISTS public.fin_arrecadacoes_listar(DATE, DATE);

CREATE OR REPLACE FUNCTION public.fin_arrecadacoes_listar(p_inicio DATE, p_fim DATE)
RETURNS TABLE (
  id UUID, data_competencia DATE, descricao TEXT, valor NUMERIC,
  plano_contas_codigo TEXT, plano_contas_nome TEXT,
  membro_nome TEXT, membro_id UUID, status TEXT, conta_id UUID
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.id, t.data_competencia, t.descricao, t.valor,
    pc.codigo, pc.nome,
    NULL::TEXT, NULL::UUID, t.status, t.conta_id
  FROM fin_transacoes t
  JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.data_competencia >= p_inicio AND t.data_competencia <= p_fim
    AND t.status <> 'cancelado'
    AND pc.codigo LIKE '3.01%'
  ORDER BY t.data_competencia DESC
$$;
