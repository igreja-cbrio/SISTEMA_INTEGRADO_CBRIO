-- Tabelas de suporte ao aplicativo mobile CBRio
-- Seguras para rodar em produção (IF NOT EXISTS / idempotentes)

-- Anúncios exibidos na Home do app
CREATE TABLE IF NOT EXISTS app_anuncios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text NOT NULL,
  descricao   text,
  cor         text DEFAULT '#00B39D',
  link        text,
  ativo       boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE app_anuncios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_anuncios_public_read" ON app_anuncios;
CREATE POLICY "app_anuncios_public_read" ON app_anuncios FOR SELECT USING (ativo = true);

-- Inscrições recebidas pelo app
CREATE TABLE IF NOT EXISTS app_inscricoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,   -- 'grupos','batismo','retiro','cursos','next','voluntariado','eventos'
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dados        jsonb DEFAULT '{}',
  status       text DEFAULT 'pendente' CHECK (status IN ('pendente','em_analise','aprovado','recusado')),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE app_inscricoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_inscricoes_own" ON app_inscricoes;
CREATE POLICY "app_inscricoes_own" ON app_inscricoes
  FOR ALL USING (auth.uid() = auth_user_id);

-- Coluna origem_cadastro em mem_membros (se não existir)
ALTER TABLE mem_membros ADD COLUMN IF NOT EXISTS origem_cadastro text;
