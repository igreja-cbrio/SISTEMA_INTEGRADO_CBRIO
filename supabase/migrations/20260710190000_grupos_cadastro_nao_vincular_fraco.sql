-- Persistência da asserção "não sou eu" do dedup da inscrição pública de
-- grupos: quando a pessoa confirma que NÃO é o cadastro parecido encontrado,
-- a aprovação do pedido não pode religá-la por sinal deniável (e-mail /
-- telefone+nome / nascimento+nome — a família compartilha contatos). Com a
-- flag, aprovarPedidoCore chama o matcher com soChaveForte (liga só por CPF).
-- Aditiva e idempotente.
ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS nao_vincular_fraco boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mem_cadastros_pendentes.nao_vincular_fraco IS
  'true quando a pessoa afirmou "não sou eu" no dedup da inscrição pública — a aprovação só pode ligar este cadastro a um membro existente por CPF exato (sinais deniáveis como e-mail/telefone de família ficam proibidos).';
