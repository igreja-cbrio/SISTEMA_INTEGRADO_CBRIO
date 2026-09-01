-- ============================================================================
-- VALOR DO CARTÃO NA PLATAFORMA EXTERNA — 2026-08-21
--
-- Pedido do Arthur (via Marcos) pro AMI CAMP 2027: *"como o retiro é 850 reais
-- no cartão, nessa primeira tela coloque lá em cima o valor de 850 reais e em
-- cada opção coloque 830 reais como desconto no pix e 850 no cartão valor
-- normal."*
--
-- ⚠️ Por que uma COLUNA e não uma conta: o preço do cartão é da tabela do
-- E-Inscrição, definida LÁ (lotes 850/880/900, com regra própria). Nosso
-- `valor_centavos` é o preço de tabela do PIX (870 = último lote), e o lote
-- atual do Pix é 830 — nenhum dos dois dá 850. Derivar o valor do cartão de
-- qualquer campo nosso seria a tela AFIRMANDO preço de outra plataforma a
-- partir de um chute; quem sabe o número é quem configurou o evento lá.
--
-- ⚠️ NULL = comportamento de hoje, sem exceção: a tela de escolha segue
-- mostrando só o lote/preço do Pix e não promete número nenhum pro cartão.
-- Nenhum evento existente muda de aparência pela aplicação desta migration.
--
-- ⚠️ É valor EXIBIDO, nunca cobrado: quem paga cartão sai da nossa página
-- antes de existir inscrição aqui (ver backend/utils/checkoutExterno.js). Este
-- número não entra em cobrança, conciliação ou relatório — se ficar defasado, o
-- estrago é uma tela desatualizada, e é por isso que ele é editável na tela de
-- edição do evento e não seedado por código.
-- ============================================================================

ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS checkout_externo_valor_centavos integer;

COMMENT ON COLUMN public.insc_eventos.checkout_externo_valor_centavos IS
  'Preço do CARTÃO na plataforma externa (e-Inscrição), em centavos, só pra EXIBIÇÃO na tela de escolha da forma de pagamento. NULL = não anunciar preço do cartão. ⚠️ Nunca é cobrado aqui: o cartão é pago lá fora, e o valor da NOSSA cobrança segue vindo de valor_centavos/lotes.';

-- ⚠️ Preço não negativo e não zero: "R$ 0,00 no cartão" numa tela de escolha é
-- promessa de gratuidade. Teto de R$ 100.000 pra typo (8500000 no lugar de
-- 85000) não virar manchete na página pública.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.insc_eventos'::regclass
       AND conname  = 'chk_insc_eventos_checkout_externo_valor'
  ) THEN
    ALTER TABLE public.insc_eventos
      ADD CONSTRAINT chk_insc_eventos_checkout_externo_valor
      CHECK (
        checkout_externo_valor_centavos IS NULL
        OR (checkout_externo_valor_centavos > 0 AND checkout_externo_valor_centavos <= 10000000)
      );
  END IF;
END $$;

-- ── O número do AMI CAMP 2027 (Lote 1 do cartão no E-Inscrição: R$ 850) ─────
-- Só o retiro: `slug` é único e o WHERE não toca em mais nada.
UPDATE public.insc_eventos
   SET checkout_externo_valor_centavos = 85000
 WHERE slug = 'retiro-ami-2027'
   AND checkout_externo_valor_centavos IS DISTINCT FROM 85000;

-- ── Conferência (rodar À PARTE, no catálogo — nunca confiar no "success") ───
-- select column_name, data_type from information_schema.columns
--  where table_name = 'insc_eventos' and column_name = 'checkout_externo_valor_centavos';
--
-- select nome, valor_centavos, checkout_externo_valor_centavos, lotes
--   from insc_eventos where slug = 'retiro-ami-2027';
--   -- esperado: 87000 (tabela do Pix) · 85000 (cartão) · lotes 830/850/870
--
-- Deve RECUSAR (23514):
--   update insc_eventos set checkout_externo_valor_centavos = 0 where slug = 'retiro-ami-2027';
