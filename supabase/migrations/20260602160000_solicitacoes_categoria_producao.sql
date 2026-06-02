-- ============================================================================
-- Solicitações · categoria "produção" (intake da área Produção de Culto)
--
-- Marcos: criar categoria de Produção no form de Solicitações, roteando para
-- area_responsavel='producao' (movimentação de material, configuração de
-- equipamentos). Só campos básicos · sem bloco específico.
--
-- A área 'producao' e o SLA dela já existem (seed do Criativo · 20260512280000:
-- producao/default 24/72 · urgente 4/24). Falta só liberar a categoria no CHECK.
-- ADITIVA · idempotente.
-- ============================================================================

ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_categoria_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_categoria_check
  CHECK (categoria = ANY (ARRAY[
    'ti','compras','reembolso','espaco','reserva_espaco','infraestrutura',
    'ferias','licenca','marketing','pagamento','servico','producao','outro'
  ]::text[]));

-- Garante a linha de SLA da produção (idempotente · já deve existir do seed).
INSERT INTO public.sla_definicoes
  (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao, ativo)
SELECT * FROM (VALUES
  ('producao'::area_adm_resp, 'default', false, 24, 72, 'Padrao · resposta 1 dia, entrega 3 dias', true),
  ('producao'::area_adm_resp, 'default', true,   4, 24, 'Urgente · entrega 1 dia', true)
) AS t(area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao, ativo)
ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO NOTHING;

-- Conferência:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'solicitacoes_categoria_check';  -- deve incluir 'producao'
