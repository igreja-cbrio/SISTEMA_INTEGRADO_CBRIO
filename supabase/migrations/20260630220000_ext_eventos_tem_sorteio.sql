-- Eventos Externos: flag se o evento tem sorteio. Quando true, o formulário
-- público revela o "número da sorte" (com confete); quando false, só confirma
-- a presença. Aditiva e backwards-compatible.
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS tem_sorteio boolean NOT NULL DEFAULT true;

-- Campos configuráveis do formulário de cada evento (além de nome + telefone,
-- que são fixos). Array de { key, label, tipo (texto|textarea|email|select),
-- obrigatorio, opcoes[] }. As respostas vão em ext_inscricoes.dados (jsonb).
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS campos jsonb NOT NULL DEFAULT '[]'::jsonb;
