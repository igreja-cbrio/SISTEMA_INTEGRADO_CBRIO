-- Dívida técnica sinalizada pelo conselho na PR da hierarquia de
-- localizações (2026-07-29), corrigida a pedido do usuário:
--
-- 1) Registrar uma movimentação e atualizar a localização/status do bem
--    eram 2 escritas separadas (insert em pat_movimentacoes + update em
--    pat_bens) sem transação — se a 2ª falhasse no meio, a aba de
--    Movimentações passava a MENTIR sobre onde o bem está de verdade.
--    `pat_registrar_movimentacao` faz as duas coisas numa função só (mesma
--    transação implícita da chamada RPC).
--
-- 2) Os contadores de conferência da convocação (total_bens_conferidos/
--    total_divergencias) eram recalculados em JS: SELECT todos os itens →
--    conta em memória → UPDATE. Duas gravações concorrentes na mesma
--    convocação podiam se basear em leituras defasadas uma da outra
--    (lost update). `pat_recalcular_convocacao` faz a contagem e a
--    gravação no MESMO comando SQL — cada chamada sempre recalcula do
--    estado atual do banco, não de um valor lido antes em JS.

CREATE OR REPLACE FUNCTION public.pat_registrar_movimentacao(
  p_bem_id uuid,
  p_tipo text,
  p_localizacao_origem_id uuid,
  p_localizacao_destino_id uuid,
  p_responsavel_id uuid,
  p_motivo text,
  p_revisao_item_id uuid,
  p_created_by uuid
)
RETURNS public.pat_movimentacoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov public.pat_movimentacoes;
BEGIN
  INSERT INTO public.pat_movimentacoes (
    bem_id, tipo, localizacao_origem_id, localizacao_destino_id,
    responsavel_id, motivo, revisao_item_id, created_by
  ) VALUES (
    p_bem_id, p_tipo, p_localizacao_origem_id, p_localizacao_destino_id,
    p_responsavel_id, p_motivo, p_revisao_item_id, p_created_by
  ) RETURNING * INTO v_mov;

  IF p_tipo = 'transferencia' AND p_localizacao_destino_id IS NOT NULL THEN
    UPDATE public.pat_bens
      SET localizacao_id = p_localizacao_destino_id, localizacao_pendente = false, alerta_divergencia_item_id = NULL
      WHERE id = p_bem_id;
  ELSIF p_tipo = 'manutencao' THEN
    UPDATE public.pat_bens SET status = 'manutencao' WHERE id = p_bem_id;
  ELSIF p_tipo = 'baixa' THEN
    UPDATE public.pat_bens SET status = 'baixado', data_baixa = COALESCE(data_baixa, CURRENT_DATE) WHERE id = p_bem_id;
  END IF;

  RETURN v_mov;
END;
$$;

CREATE OR REPLACE FUNCTION public.pat_recalcular_convocacao(p_convocacao_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pat_revisao_convocacoes c
  SET
    total_bens_conferidos = (
      SELECT count(*) FROM public.pat_revisao_itens i
      WHERE i.convocacao_id = p_convocacao_id AND i.encontrado IS NOT NULL
    ),
    total_divergencias = (
      SELECT count(*) FROM public.pat_revisao_itens i
      WHERE i.convocacao_id = p_convocacao_id
        AND (i.encontrado = false OR i.status_fisico IN ('danificado', 'nao_encontrado'))
    )
  WHERE c.id = p_convocacao_id;
$$;
