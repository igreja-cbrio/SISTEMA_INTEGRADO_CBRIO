-- Financeiro · Fase 1 da reforma de Transações
-- Aditiva e idempotente: parcelamento no cartão + anexos (comprovantes/notas).
-- O "tag cartão" da F1 é via forma_pagamento='Cartão de Crédito' + parcelas
-- (cartao_id/fatura ficam pra Fase 4).

ALTER TABLE public.fin_transacoes ADD COLUMN IF NOT EXISTS parcelas_total integer;
ALTER TABLE public.fin_transacoes ADD COLUMN IF NOT EXISTS parcela_num integer;
ALTER TABLE public.fin_transacoes ADD COLUMN IF NOT EXISTS anexos_url jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.fin_transacoes.parcelas_total IS 'Compra parcelada no cartão: total de parcelas (null = à vista/n.a.)';
COMMENT ON COLUMN public.fin_transacoes.parcela_num IS 'Nº desta parcela (1-based) quando parcelado';
COMMENT ON COLUMN public.fin_transacoes.anexos_url IS 'Comprovantes/notas anexados: [{url, nome, tipo, em}]';
