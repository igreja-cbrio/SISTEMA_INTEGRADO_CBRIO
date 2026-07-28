-- ═══════════════════════════════════════════════════════════════════════════
-- Inscrições · teto de parcelas POR EVENTO (2026-07-28)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUE: parcelar foi o requisito que decidiu a escolha do gateway (a Stripe
-- não faz parcelado no Brasil). Mas `insc_eventos` não tinha onde guardar o
-- teto, então `ev.parcelas_max` chegava sempre `undefined` na criação da
-- cobrança — parcelado ficaria governado só pela configuração da conta do PSP,
-- igual para todos os eventos.
--
-- E o teto NÃO é igual para todos: quem decide é **quando a igreja paga o
-- local**. Um retiro em novembro e outro em março admitem número diferente de
-- parcelas, e isso é decisão por edição, não configuração global.
--
-- NULL = sem teto nosso; vale o máximo configurado na conta do PSP (o Asaas
-- permite até 21x). 1 = à vista.
--
-- Aditiva e idempotente, MAS ⚠️ **aplicar ANTES do merge**: o `select` do
-- evento em `publicEventoExterno.js` passa a pedir as duas colunas, e o
-- PostgREST erra a consulta inteira quando uma coluna não existe — a página
-- pública `/evento/:slug` responderia 404 até a migration rodar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS parcelas_max integer
    CHECK (parcelas_max IS NULL OR (parcelas_max >= 1 AND parcelas_max <= 21));

COMMENT ON COLUMN public.insc_eventos.parcelas_max IS
  'Teto de parcelas no cartão para ESTE evento. NULL = usa o máximo da conta do PSP; 1 = à vista. Quem define é a data em que a igreja paga o local — por isso é por edição, não global.';

-- Juros do parcelado repassados ao inscrito (decisão do Marcos 2026-07-28: a
-- igreja recebe cheio, sem custo de antecipação). Fica por evento porque a
-- alternativa (a igreja absorver) é uma escolha de campanha, não do sistema.
ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS juros_repassados boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.insc_eventos.juros_repassados IS
  'true = o inscrito paga os juros do parcelamento ("R$ 800 à vista ou 12x de R$ 76"). false = a igreja absorve via antecipação no PSP. Default true (decisão de 28/07).';
