-- ============================================================================
-- Fix: Doação (tipo 'saida') não tirava o bem do patrimônio ativo
-- ----------------------------------------------------------------------------
-- Achado do conselho deliberativo (2026-07-31): quando o rótulo "Saída" virou
-- "Doação" no formulário (removendo o campo de localização), a RPC
-- `pat_registrar_movimentacao` continuou sem nenhum ramo para p_tipo='saida'.
-- Resultado: registrar uma Doação gravava a movimentação (com o motivo), mas
-- o bem continuava status='ativo', na mesma localização — contando pra
-- sempre no dashboard/depreciação, quando a decisão real era "doação tira o
-- bem do patrimônio de vez" (mesma semântica de uma baixa, com motivo
-- especializado). Doação agora usa o MESMO ramo de baixa.
-- ============================================================================

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
  ELSIF p_tipo IN ('baixa', 'saida') THEN
    UPDATE public.pat_bens SET status = 'baixado', data_baixa = COALESCE(data_baixa, CURRENT_DATE) WHERE id = p_bem_id;
  END IF;

  RETURN v_mov;
END;
$$;
