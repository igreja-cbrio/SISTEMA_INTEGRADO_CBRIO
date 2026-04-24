-- Tabela de configuração: responsável padrão por área do ciclo criativo.
-- Ao ativar um ciclo, o sistema consulta esta tabela para preencher
-- automaticamente o campo responsavel_nome de cada tarefa criada.
CREATE TABLE IF NOT EXISTS area_responsaveis (
  area TEXT PRIMARY KEY,
  responsavel_nome TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed com os responsáveis atuais
INSERT INTO area_responsaveis (area, responsavel_nome) VALUES
  ('cozinha',    'Jéssica Salviano'),
  ('limpeza',    'Jéssica Salviano'),
  ('manutencao', 'Amaury'),
  ('compras',    'Amaury'),
  ('producao',   'Pedro Fernandes'),
  ('marketing',  'Pedro Paiva'),
  ('financeiro', 'Yago Torres'),
  ('adm',        'Marcos Paulo')
ON CONFLICT (area) DO UPDATE SET responsavel_nome = EXCLUDED.responsavel_nome, updated_at = now();
