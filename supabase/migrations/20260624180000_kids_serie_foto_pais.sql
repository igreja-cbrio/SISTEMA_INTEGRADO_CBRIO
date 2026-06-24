-- Cadastro da criança · série escolar + foto da mãe e do pai (2026-06-24)
-- O responsável passa, no pedido de vínculo (app), a SÉRIE que a criança cursa
-- e a FOTO de cada responsável (mãe/pai) — pra a equipe Kids identificar na
-- retirada. Fotos em bucket privado (kids-documentos), como os documentos.

ALTER TABLE public.kids_vinculo_solicitacoes
  ADD COLUMN IF NOT EXISTS serie                    text,
  ADD COLUMN IF NOT EXISTS foto_mae_path            text,
  ADD COLUMN IF NOT EXISTS foto_pai_path            text,
  ADD COLUMN IF NOT EXISTS necessidade_especial     text,
  -- Consentimento de uso de imagem em MARKETING (FELCA/ECA Digital) · separado
  -- do consentimento de foto pra identificação no check-in.
  ADD COLUMN IF NOT EXISTS consent_marketing        boolean,
  ADD COLUMN IF NOT EXISTS consent_marketing_em     timestamptz,
  ADD COLUMN IF NOT EXISTS consent_marketing_versao text;

-- Os dados acompanham a criança após a aprovação do vínculo.
ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS serie                    text,
  ADD COLUMN IF NOT EXISTS consent_marketing        boolean,
  ADD COLUMN IF NOT EXISTS consent_marketing_em     timestamptz,
  ADD COLUMN IF NOT EXISTS consent_marketing_versao text;

COMMENT ON COLUMN public.kids_criancas.serie IS 'Série/ano escolar que a criança cursa (texto livre).';
COMMENT ON COLUMN public.kids_criancas.consent_marketing IS 'Autoriza uso de fotos do culto Kids em marketing/posts/campanhas (FELCA/ECA Digital).';
-- necessidades_especiais e observacoes_medicas já existem em kids_criancas.
