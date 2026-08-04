-- ============================================================================
-- App · verificação de celular pro "login rápido por CPF" (Marcos · 04/08/2026)
--
-- POR QUE EXISTE: o app vai ser aberto pelos LÍDERES de grupo, que em geral já
-- estão cadastrados. Digitar o CPF e o sistema "achar" a pessoa é o caminho
-- rápido — MAS **CPF NÃO É SENHA**: ele está em nota fiscal, cadastro de loja,
-- planilha. Quem tem o CPF de alguém NÃO pode assumir o cadastro dela (o
-- cadastro dá acesso a grupo, filhos no Kids e histórico de contribuição).
--
-- Então o desenho é: CPF **identifica** (não autentica) → o servidor manda um
-- código pro **telefone QUE JÁ ESTÁ NO CADASTRO** (nunca pra um número digitado
-- na hora) → quem prova posse daquele número é vinculado. É a mesma régua de
-- "prova de posse" dos links do WhatsApp dos líderes.
--
-- Só o backend (service_role) escreve/lê: o código nunca passa pela anon key.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_verificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Conta do app que está tentando se vincular (auth.users.id).
  auth_user_id uuid NOT NULL,
  -- Cadastro-alvo (a pessoa que o CPF identificou).
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  -- Telefone PARA ONDE o código foi (snapshot do cadastro, digits-only) —
  -- guardado pra auditoria: prova que não mandamos pra número digitado.
  telefone text NOT NULL,
  -- ⚠️ HASH do código, nunca o código em claro (quem lê a tabela não entra na
  -- conta de ninguém). sha256(codigo || id) — o id salga cada linha.
  codigo_hash text NOT NULL,
  tentativas smallint NOT NULL DEFAULT 0,
  expira_em timestamptz NOT NULL,
  consumido_em timestamptz,
  canal text NOT NULL DEFAULT 'whatsapp',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Uma verificação ABERTA por conta (o pedido novo substitui o anterior — quem
-- pediu de novo é a mesma pessoa; sem isso, N códigos válidos ao mesmo tempo).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_app_verificacoes_aberta
  ON public.app_verificacoes (auth_user_id) WHERE consumido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_verificacoes_membro
  ON public.app_verificacoes (membro_id, created_at DESC);

-- Anti-enumeração/abuso: dá pra contar quantos pedidos saíram por telefone.
CREATE INDEX IF NOT EXISTS idx_app_verificacoes_telefone
  ON public.app_verificacoes (telefone, created_at DESC);

ALTER TABLE public.app_verificacoes ENABLE ROW LEVEL SECURITY;

-- NADA de policy pra authenticated/anon: o fluxo inteiro passa pelo backend
-- (/api/app/identidade/*), que usa service_role. Uma policy de SELECT aqui
-- deixaria a anon key ler o alvo do vínculo de outra pessoa.
DROP POLICY IF EXISTS app_verificacoes_service ON public.app_verificacoes;
CREATE POLICY app_verificacoes_service ON public.app_verificacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS app_verificacoes_super ON public.app_verificacoes;
CREATE POLICY app_verificacoes_super ON public.app_verificacoes
  FOR SELECT TO authenticated USING (public.is_super_admin());

COMMENT ON TABLE public.app_verificacoes IS
  'Códigos de confirmação de celular do app (login rápido por CPF). CPF identifica, o código no telefone DO CADASTRO autentica. Hash do código, nunca o código. Só service_role.';

-- Sem soft-delete de propósito: é dado transitório de segurança (código
-- expirado não tem valor histórico) e PK simples com CASCADE no membro basta.
