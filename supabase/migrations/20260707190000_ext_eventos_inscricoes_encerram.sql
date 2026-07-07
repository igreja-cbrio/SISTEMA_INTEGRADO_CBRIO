-- Eventos Externos · data/hora de encerramento das inscrições (opcional).
-- Depois desse instante o formulário público bloqueia novas inscrições
-- (além do toggle form_ativo). Aditivo.
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS inscricoes_encerram_em timestamptz;

-- Mensagem de agradecimento (tela de sucesso pós-inscrição) editável.
-- NULL = usa o texto padrão ("Presença confirmada!" + subtexto).
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS msg_sucesso_titulo text;
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS msg_sucesso_texto text;

-- Mensagem pré-definida do botão "Compartilhar no WhatsApp" (editável).
-- NULL = usa o texto padrão. Pode conter {link} pra inserir a URL do formulário.
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS msg_whatsapp text;
