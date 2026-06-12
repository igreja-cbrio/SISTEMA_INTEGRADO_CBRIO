-- Tarefas pessoais: cada usuario pode criar tarefas em datas especificas
CREATE TABLE IF NOT EXISTS tarefas_pessoais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  data DATE NOT NULL,
  area TEXT,
  done BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_pessoais_data ON tarefas_pessoais(data);
CREATE INDEX IF NOT EXISTS idx_tarefas_pessoais_area ON tarefas_pessoais(area);
CREATE INDEX IF NOT EXISTS idx_tarefas_pessoais_user ON tarefas_pessoais(created_by);

ALTER TABLE tarefas_pessoais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_pessoais_read" ON tarefas_pessoais
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "tarefas_pessoais_write" ON tarefas_pessoais
  FOR ALL USING (auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','diretor'))
  );
