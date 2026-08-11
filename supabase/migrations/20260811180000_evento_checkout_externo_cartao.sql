-- ============================================================================
-- CHECKOUT EXTERNO DE CARTÃO POR EVENTO — 2026-08-11
--
-- Pedido do Matheus para o retiro: *"vamos usar o e-inscrição, mas apenas para
-- pagamentos no cartão. Antes da pessoa se inscrever, deve perguntar se o
-- pagamento é no cartão de crédito ou Pix. Se for Pix, ela preenche as
-- informações e gera o QR normalmente. Se marcar cartão, é direcionada para o
-- e-inscrição. Esse link deve ser inserido nas configurações do evento por
-- dentro do sistema."*
--
-- ⚠️ POR EVENTO, não global: a decisão "quem cobra o cartão" muda de evento pra
-- evento (o retiro vai pro e-Inscrição; o Celebra não cobra nada). Env global
-- não teria como expressar isso e só propaga com redeploy.
--
-- ⚠️⚠️ A COLUNA NÃO É SÓ UM LINK — ela DESLIGA o cartão do nosso checkout.
-- Com ela preenchida, `metodos_ofertados` da cobrança sai sem 'cartao'
-- (backend/utils/checkoutExterno.js), que é o campo conferido em `decidirForma`
-- ("forma fora da lista não é oferecida nem por chamada direta"). Sem isso, um
-- link antigo de /pagamento/<token>, o app ou uma chamada direta seguiriam
-- cobrando cartão por dentro — e a mesma inscrição poderia ser paga nos DOIS
-- lugares, com a conciliação tendo que adivinhar qual valeu.
--
-- ⚠️ Aditiva e idempotente. NULL = comportamento de hoje, sem exceção: nenhum
-- evento existente muda de fluxo pela aplicação desta migration.
-- ============================================================================

ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS checkout_externo_url  text,
  ADD COLUMN IF NOT EXISTS checkout_externo_nome text;

COMMENT ON COLUMN public.insc_eventos.checkout_externo_url IS
  'Link da inscrição/pagamento com CARTÃO numa plataforma externa (ex.: e-Inscrição). NULL = o cartão é cobrado pelo nosso checkout. ⚠️ Preenchido, ele REMOVE ''cartao'' de metodos_ofertados da cobrança — o cartão passa a existir SÓ lá fora, e a pessoa que escolhe cartão nem chega a criar inscrição aqui.';

COMMENT ON COLUMN public.insc_eventos.checkout_externo_nome IS
  'Nome da plataforma, só pra tela dizer para onde a pessoa está indo ("Você será levado para o e-Inscrição"). Vazio = "e-Inscrição".';

-- ⚠️ https OBRIGATÓRIO no próprio banco, não só na aplicação: este valor vira
-- destino de navegação da pessoa que vai digitar cartão do outro lado. O CHECK
-- é a rede pra escrita que não passe pela rota (script, SQL Editor, import).
-- `javascript:`/`data:`/`http:` param aqui.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.insc_eventos'::regclass
       AND conname  = 'chk_insc_eventos_checkout_externo_https'
  ) THEN
    ALTER TABLE public.insc_eventos
      ADD CONSTRAINT chk_insc_eventos_checkout_externo_https
      CHECK (checkout_externo_url IS NULL OR checkout_externo_url ~* '^https://[^\s/@]+\.[^\s/@]+');
  END IF;
END $$;

-- ── Conferência (rodar À PARTE, no catálogo — nunca confiar no "success") ───
-- select column_name, data_type from information_schema.columns
--  where table_name = 'insc_eventos' and column_name like 'checkout_externo%';
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.insc_eventos'::regclass
--    and conname = 'chk_insc_eventos_checkout_externo_https';
--
-- Deve RECUSAR (23514):
--   update insc_eventos set checkout_externo_url = 'javascript:alert(1)' where id = '<id>';
