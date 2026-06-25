-- Convite do NEXT · marca quando o convertido foi CONVIDADO pro NEXT (disparo).
-- Campo dedicado (NÃO usar next_resolucao, que o funil do Next trata como
-- "resolvido"). Aditivo.
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS next_convite_em timestamptz,
  ADD COLUMN IF NOT EXISTS next_convite_por uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.cui_convertidos.next_convite_em IS
  'Quando o convertido recebeu o convite do NEXT (disparo de mensagem). Não é resolução do funil.';
