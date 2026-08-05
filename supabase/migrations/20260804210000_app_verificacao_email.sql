-- ============================================================================
-- App · o código de confirmação passa a ir por E-MAIL (Marcos · 04/08/2026)
--
-- POR QUE: a Meta recusou a categoria **Autenticação** pra nossa conta do
-- WhatsApp Business ("sua conta não pode usar esse tipo de mensagem") — e
-- código de uso único NÃO pode ir em template utility (é violação de política
-- e derruba a nota de qualidade do número que fala com os 87 líderes).
-- O canal passa a ser o e-mail (Microsoft Graph, já usado nas aprovações).
--
-- A LEI do fluxo não muda: o código vai pro contato QUE JÁ ESTÁ NO CADASTRO
-- (nunca pra um endereço digitado na hora). Só o canal mudou.
-- ============================================================================

ALTER TABLE public.app_verificacoes
  ADD COLUMN IF NOT EXISTS email text;

-- `telefone` deixa de ser obrigatório: agora o destino pode ser e-mail. As
-- linhas antigas (se houver) continuam válidas com telefone preenchido.
ALTER TABLE public.app_verificacoes
  ALTER COLUMN telefone DROP NOT NULL;

-- Uma verificação SEM destino nenhum não prova posse de nada — seria um código
-- que ninguém recebe (e que, pior, alguém poderia tentar adivinhar).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_app_verificacoes_destino'
       AND conrelid = 'public.app_verificacoes'::regclass
  ) THEN
    ALTER TABLE public.app_verificacoes
      ADD CONSTRAINT chk_app_verificacoes_destino
      CHECK (telefone IS NOT NULL OR email IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_verificacoes_email
  ON public.app_verificacoes (email, created_at DESC);

COMMENT ON COLUMN public.app_verificacoes.email IS
  'Destino do código quando o canal é e-mail (snapshot do e-mail DO CADASTRO — prova que não mandamos pra endereço digitado na hora).';
