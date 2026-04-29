-- Novos campos para tarefas pessoais: prioridade, recorrencia, horario, etc.
ALTER TABLE tarefas_pessoais
  ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS recorrencia TEXT DEFAULT 'unica',
  ADD COLUMN IF NOT EXISTS horario TIME,
  ADD COLUMN IF NOT EXISTS responsavel_id UUID,
  ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS processo_id UUID REFERENCES processos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorrencia_id UUID;

CREATE INDEX IF NOT EXISTS idx_tarefas_pessoais_recorrencia ON tarefas_pessoais(recorrencia_id);
