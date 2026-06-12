-- Modulo Processos: tabela principal para gestao de processos operacionais
-- Processos linkam a KPIs (hardcoded no frontend) via indicador_ids TEXT[]

CREATE TABLE IF NOT EXISTS processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  responsavel_id UUID,
  responsavel_nome TEXT,
  area TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('Ministerial','Geracional','Criativo','Operacoes')),
  indicador_ids TEXT[] DEFAULT '{}',
  is_okr BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','concluido','arquivado')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processos_area ON processos(area);
CREATE INDEX IF NOT EXISTS idx_processos_categoria ON processos(categoria);
CREATE INDEX IF NOT EXISTS idx_processos_is_okr ON processos(is_okr) WHERE is_okr = true;
CREATE INDEX IF NOT EXISTS idx_processos_status ON processos(status);

-- Habilita RLS (guards vem do middleware, mas RLS exige authenticated)
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "processos_read" ON processos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "processos_write" ON processos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','diretor'))
  );

-- Registrar modulo para sistema de permissoes
INSERT INTO modulos (nome, ativo) VALUES ('Processos', true) ON CONFLICT (nome) DO NOTHING;
