-- Campos do Tripé do Ouriço nos projetos (importados do SharePoint)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ourico_passa BOOLEAN;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ourico_justificativa TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gera_unidade BOOLEAN;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gera_unidade_just TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS colabora_expansao BOOLEAN;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS colabora_expansao_just TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS macro_eixo TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS publico_alvo TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS complexidade TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS impacto TEXT;
