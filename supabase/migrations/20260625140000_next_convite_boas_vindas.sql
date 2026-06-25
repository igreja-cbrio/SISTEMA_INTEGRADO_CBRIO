-- Convite do NEXT · mensagem de boas-vindas (acolhimento sem link, pra aquecer
-- antes do convite). Aditivo.
ALTER TABLE public.next_convite_config
  ADD COLUMN IF NOT EXISTS mensagem_boas_vindas text;

UPDATE public.next_convite_config
SET mensagem_boas_vindas = 'Oi, {nome}! 💙 Que alegria ter você com a gente na CBRio! Foi muito especial te ver por aqui. Queremos te acompanhar nesse começo de caminhada — qualquer coisa, é só chamar. Seja muito bem-vindo(a)! 🙌'
WHERE id = 1 AND (mensagem_boas_vindas IS NULL OR mensagem_boas_vindas = '');
