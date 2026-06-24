-- ============================================================
-- Kids — Solicitação de vínculo: nome dos pais + foto da criança
-- ============================================================
-- Descontinua os DOCUMENTOS de identidade no fluxo de solicitação de vínculo
-- pelo app. Agora o responsável informa só o NOME DA CRIANÇA + o NOME DOS PAIS
-- (mãe e/ou pai) e, opcionalmente, uma FOTO DA CRIANÇA com consentimento
-- explícito (ECA Lei 8.069/90 arts. 17/18 · LGPD Lei 13.709/18 art. 14).
--
-- Aditivo + relaxa constraints (backwards-compatible): as colunas de documentos
-- legados (crianca_doc_path/doc_pai_path/doc_mae_path) PERMANECEM nullable pra
-- não quebrar solicitações antigas nem versões antigas do app na transição.
-- ============================================================

-- 1. Novas colunas: nome dos pais + foto da criança (bucket privado kids-documentos)
ALTER TABLE public.kids_vinculo_solicitacoes
  ADD COLUMN IF NOT EXISTS mae_nome text,
  ADD COLUMN IF NOT EXISTS pai_nome text,
  ADD COLUMN IF NOT EXISTS crianca_foto_path text,
  ADD COLUMN IF NOT EXISTS foto_consentimento_em timestamptz,
  ADD COLUMN IF NOT EXISTS foto_consentimento_versao text;

-- 2. Documento da criança deixa de ser obrigatório (fluxo novo não envia doc)
ALTER TABLE public.kids_vinculo_solicitacoes
  ALTER COLUMN crianca_doc_path DROP NOT NULL;

-- 3. Remove o CHECK que exigia documento de pai e/ou mãe (agora é nome, validado
--    na camada de aplicação: nome da mãe e/ou do pai)
ALTER TABLE public.kids_vinculo_solicitacoes
  DROP CONSTRAINT IF EXISTS kids_vinc_doc_resp;

COMMENT ON COLUMN public.kids_vinculo_solicitacoes.mae_nome IS 'Nome da mãe informado pelo responsável (fluxo novo · substitui doc_mae_path).';
COMMENT ON COLUMN public.kids_vinculo_solicitacoes.pai_nome IS 'Nome do pai informado pelo responsável (fluxo novo · substitui doc_pai_path).';
COMMENT ON COLUMN public.kids_vinculo_solicitacoes.crianca_foto_path IS 'Path da foto da criança no bucket privado kids-documentos (opcional · só com consentimento).';
COMMENT ON COLUMN public.kids_vinculo_solicitacoes.foto_consentimento_em IS 'Quando o responsável consentiu o uso da imagem (ECA/LGPD). NULL = sem foto/consentimento.';
