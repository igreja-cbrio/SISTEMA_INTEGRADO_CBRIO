-- Campos novos no cadastro do bem (pedido do usuário 2026-07-29, item 4):
-- número da NF, garantia, responsável pelo bem, data de baixa. responsavel_id
-- segue a lei do projeto de responsável/líder sempre como UUID FK pra
-- profiles (nunca texto livre) — o valor SUGERIDO vem do
-- pat_localizacoes.coordenador_id (coluna dormente desde a revisão
-- periódica), mas fica editável por bem, não reaproveitado como storage.

ALTER TABLE public.pat_bens
  ADD COLUMN IF NOT EXISTS numero_nf text,
  ADD COLUMN IF NOT EXISTS tem_garantia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantia_ate date,
  ADD COLUMN IF NOT EXISTS data_baixa date,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.pat_bens.numero_nf IS 'Número da nota fiscal de aquisição do bem, texto livre (formatos variam por fornecedor).';
COMMENT ON COLUMN public.pat_bens.tem_garantia IS 'Se o bem tem garantia ativa. Default false.';
COMMENT ON COLUMN public.pat_bens.garantia_ate IS 'Data de validade da garantia, quando tem_garantia = true. Opcional.';
COMMENT ON COLUMN public.pat_bens.data_baixa IS 'Data em que o bem foi dado de baixa (status=baixado). NULL enquanto ativo; limpo automaticamente se o status voltar a mudar.';
COMMENT ON COLUMN public.pat_bens.responsavel_id IS 'Responsável pelo bem (UUID FK profiles, nunca texto livre). Sugerido a partir do coordenador da localização no cadastro, mas editável por bem.';
