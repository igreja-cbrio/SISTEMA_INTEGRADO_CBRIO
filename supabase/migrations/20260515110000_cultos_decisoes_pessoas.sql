-- ============================================================================
-- Decisoes individuais por culto · sistema unico
--
-- Marcos: "vamos subir entao para decisoes os dados das pessoas, quero
--          tambem que na area de integracao, sempre que for preenchido as
--          decisoes de pessoas, tenha um campo para ser inserido os dados
--          de cada um que toma essa decisao em todos os cultos".
--
-- Hoje: cultos.decisoes_presenciais e um NUMERO agregado (ex: 5). Sem
-- rastreabilidade individual. Apos a remocao da aba Visitantes (PR #399),
-- nao ha caminho pra capturar nome + contato de quem decidiu.
--
-- Agora: tabela cultos_decisoes_pessoas com 1 row por pessoa que tomou
-- decisao no culto · vincula opcionalmente a mem_membros e ao membro (cria
-- trilha 'conversao' automatica · NSM segue). Linha tem `pessoa_id` opcional
-- pra registrar nome avulso enquanto o cadastro completo nao acontece.
--
-- Fluxo:
--   1. Lider preenche cultos.decisoes_presenciais = 5 no modal
--   2. Modal expande secao "Registrar dados das 5 pessoas"
--   3. Lider preenche nome (obrigatorio), telefone, email, idade pra cada
--   4. Insere row em cultos_decisoes_pessoas
--   5. Trigger tenta vincular a mem_membros existente via CPF/email/telefone
--      (busca exata) ou cria membro novo + trilha 'conversao'
--   6. nsm_eventos recebe um evento de engajamento valor=seguir
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cultos_decisoes_pessoas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id    uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  membro_id   uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  -- Dados do registro (sempre presente · membro_id e opcional)
  nome        text NOT NULL CHECK (length(trim(nome)) >= 2),
  telefone    text,
  email       text,
  idade       int CHECK (idade IS NULL OR (idade >= 0 AND idade <= 120)),
  cpf         text,
  -- Categoricos
  tipo_decisao text NOT NULL DEFAULT 'presencial'
    CHECK (tipo_decisao IN ('presencial', 'online')),
  observacoes  text,
  -- Trilha de acompanhamento (preenchido na criacao)
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  registrado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Status do follow-up pastoral
  status_followup text NOT NULL DEFAULT 'pendente'
    CHECK (status_followup IN ('pendente', 'em_acompanhamento', 'integrado', 'sem_resposta')),
  observacoes_followup text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_cultos_dec_pessoas_culto    ON public.cultos_decisoes_pessoas (culto_id);
CREATE INDEX IF NOT EXISTS idx_cultos_dec_pessoas_membro   ON public.cultos_decisoes_pessoas (membro_id);
CREATE INDEX IF NOT EXISTS idx_cultos_dec_pessoas_status   ON public.cultos_decisoes_pessoas (status_followup, registrado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cultos_dec_pessoas_data     ON public.cultos_decisoes_pessoas (registrado_em DESC);

-- Updated_at automatico
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cultos_dec_pessoas_set_updated_at ON public.cultos_decisoes_pessoas;
CREATE TRIGGER cultos_dec_pessoas_set_updated_at
  BEFORE UPDATE ON public.cultos_decisoes_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.tg_cultos_dec_pessoas_set_updated_at();

COMMENT ON TABLE public.cultos_decisoes_pessoas IS
  'Dados individuais de cada pessoa que tomou decisao em culto · 1 row por pessoa · vincula a mem_membros quando possivel.';

-- RLS (mesma logica de cultos: leitura aberta autenticados, escrita
-- restrita a quem pode editar cultos · integracao/admin/diretor)
ALTER TABLE public.cultos_decisoes_pessoas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_cultos_dec_pessoas" ON public.cultos_decisoes_pessoas;
CREATE POLICY "service_role_cultos_dec_pessoas"
  ON public.cultos_decisoes_pessoas FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "auth_read_cultos_dec_pessoas" ON public.cultos_decisoes_pessoas;
CREATE POLICY "auth_read_cultos_dec_pessoas"
  ON public.cultos_decisoes_pessoas FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT * FROM cultos_decisoes_pessoas LIMIT 5;  -- vazio inicialmente
--   \d cultos_decisoes_pessoas  -- ve schema
-- ============================================================================
