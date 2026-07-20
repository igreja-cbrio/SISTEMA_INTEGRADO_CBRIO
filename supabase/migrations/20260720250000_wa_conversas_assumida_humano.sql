-- Conversa "assumida por humano": iniciada/respondida pelo inbox (Nova conversa
-- ou resposta do time). Nesses casos, as respostas da pessoa voltam pro inbox —
-- mesmo se o número for líder do bot (senão a coleta engolia a conversa e a
-- janela de 24h nunca abria no inbox). Já aplicada via MCP.
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS assumida_humano boolean NOT NULL DEFAULT false;

-- Backfill: conversas que já têm um envio humano/template (Nova conversa/responder).
UPDATE public.wa_conversas c SET assumida_humano = true
WHERE assumida_humano = false AND EXISTS (
  SELECT 1 FROM public.wa_mensagens m
  WHERE m.conversa_id = c.id AND m.direcao = 'out' AND (m.autor_id IS NOT NULL OR m.tipo = 'template')
);
