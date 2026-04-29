-- Agenda semanal: configura em qual dia cada indicador deve ser preenchido
-- Template unico editavel pelo admin, visivel por todas as areas

CREATE TABLE IF NOT EXISTS indicador_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador_id TEXT NOT NULL,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo, 6=sabado
  area TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(indicador_id)
);

CREATE INDEX IF NOT EXISTS idx_indicador_agenda_area ON indicador_agenda(area);
CREATE INDEX IF NOT EXISTS idx_indicador_agenda_dia ON indicador_agenda(dia_semana);

ALTER TABLE indicador_agenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_read" ON indicador_agenda
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "agenda_write" ON indicador_agenda
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','diretor'))
  );

-- Registros de preenchimento dos indicadores via processos
CREATE TABLE IF NOT EXISTS processo_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
  indicador_id TEXT NOT NULL,
  valor NUMERIC,
  periodo TEXT,
  data_preenchimento DATE DEFAULT CURRENT_DATE,
  responsavel_id UUID,
  responsavel_nome TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processo_registros_processo ON processo_registros(processo_id);
CREATE INDEX IF NOT EXISTS idx_processo_registros_indicador ON processo_registros(indicador_id);

ALTER TABLE processo_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registros_read" ON processo_registros
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "registros_write" ON processo_registros
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','diretor'))
  );
