-- ============================================================================
-- Desativa segmento NSM 'cba'
--
-- Marcos: "precisa ser retirado o cba da ala de segmento, dos filtros de
--          dados e de todas as mandalas exceto da mandala de seguir a jesus
--          que tem o batismo e aceitação"
--
-- O segmento 'cba' (CBA Rede) no NSM era um segmento de igrejas-tipo CBA.
-- Como vamos coletar so batismos/aceitacoes (nao engajamento de membros das
-- igrejas CBA), o segmento NSM deixa de fazer sentido.
-- Mantemos a row pra preservar dados historicos (ativo=false).
-- ============================================================================

UPDATE public.nsm_estado
   SET ativo = false, atualizado_em = now()
 WHERE segmento = 'cba';

-- Conferencia:
-- SELECT segmento, ativo FROM nsm_estado WHERE segmento = 'cba';
-- Espera: ativo = false
-- ============================================================================
