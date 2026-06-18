-- ============================================================
-- Kids · foto da criança pelo app com CONSENTIMENTO ECA/LGPD (2026-06-17)
-- O responsável pode (opcionalmente) adicionar a foto da criança. Exige
-- consentimento explícito, específico e informado (ECA Lei 8.069/90 art. 17/18
-- — direito à imagem do menor · LGPD Lei 13.709/18 art. 14 — dado de criança
-- com consentimento destacado de um dos pais/responsável, no melhor interesse
-- da criança). Consentimento é REVOGÁVEL (remover a foto limpa tudo).
-- A foto fica em bucket PRIVADO (kids-documentos, prefixo foto-crianca/),
-- servida só por signed URL ao responsável autorizado + equipe Kids.
-- (foto_url e foto_consentimento_em já existiam.)
-- ============================================================
ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS foto_storage_path text,
  ADD COLUMN IF NOT EXISTS foto_consentimento_por uuid,
  ADD COLUMN IF NOT EXISTS foto_consentimento_versao text;

COMMENT ON COLUMN public.kids_criancas.foto_storage_path IS 'Path no bucket privado kids-documentos (foto enviada pelo app). Servir só por signed URL.';
COMMENT ON COLUMN public.kids_criancas.foto_consentimento_em IS 'Quando o responsável consentiu o uso da imagem (ECA/LGPD). NULL = sem consentimento → NÃO exibir a foto.';
COMMENT ON COLUMN public.kids_criancas.foto_consentimento_por IS 'auth.users.id do responsável que deu o consentimento.';
COMMENT ON COLUMN public.kids_criancas.foto_consentimento_versao IS 'Versão do texto de consentimento aceito (ex.: eca-lgpd-v1).';
