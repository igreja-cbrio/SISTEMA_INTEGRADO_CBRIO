-- Planejamento Anual · proposta em mais de um local + "Toda a igreja" +
-- detalhe do endereço quando "Fora da igreja" (pedido do Diego · 2026-09-10).
--
-- 1) `plan_propostas.locais_adicionais_ids` guarda os locais MARCADOS ALÉM
--    do `local_id` principal (checkbox "mais de um local" → dropdown extra).
--    O `local_id` principal continua sendo o único usado no cálculo de
--    conflito de espaço (fn_plan_conflitos) — os adicionais são só
--    informativos por ora, para não mudar a régua de conflito existente.
-- 2) `plan_propostas.local_fora_detalhe` guarda o texto livre de "aonde" o
--    evento acontece quando algum dos locais selecionados (principal ou
--    adicional) é a linha "Fora da igreja".
-- 3) Nova opção fixa "Toda a igreja" em plan_locais (gera_conflito = false,
--    é abrangência, não espaço físico único — não faz sentido conflitar com
--    outra proposta por "ocupar o mesmo espaço").
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING.

ALTER TABLE public.plan_propostas
  ADD COLUMN IF NOT EXISTS locais_adicionais_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS local_fora_detalhe text;

COMMENT ON COLUMN public.plan_propostas.locais_adicionais_ids IS
  'Locais extras quando o evento acontece em mais de um lugar (além de local_id). Não entra no cálculo de conflito de espaço.';
COMMENT ON COLUMN public.plan_propostas.local_fora_detalhe IS
  'Endereço/descrição livre de onde é o evento, preenchido quando local_id ou algum de locais_adicionais_ids é a linha "Fora da igreja".';

INSERT INTO public.plan_locais (nome, gera_conflito, ordem)
VALUES ('Toda a igreja', false, 0)
ON CONFLICT (nome) DO NOTHING;
