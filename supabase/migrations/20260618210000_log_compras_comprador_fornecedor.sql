-- Compras · comprador = colaborador real (rh_funcionarios) + endereço do fornecedor
--
-- 1) log_compras.comprador_id → liga a compra ao COLABORADOR que comprou
--    (rh_funcionarios) pra ter tudo registrado (o texto `comprador` vira só
--    rótulo histórico/fallback).
-- 2) log_fornecedores.endereco → permite marcar fornecedor "incompleto" quando
--    falta endereço/CNPJ/telefone (cadastro automático pela aba Compras).

ALTER TABLE public.log_compras
  ADD COLUMN IF NOT EXISTS comprador_id UUID REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_log_compras_comprador
  ON public.log_compras (comprador_id) WHERE comprador_id IS NOT NULL;

ALTER TABLE public.log_fornecedores
  ADD COLUMN IF NOT EXISTS endereco TEXT;

COMMENT ON COLUMN public.log_compras.comprador_id IS
  'Colaborador (rh_funcionarios) que fez a compra. O texto comprador é rótulo histórico/fallback.';
