-- ============================================================================
-- Encontros 1x1 mensais com voluntarios
--
-- Permite ao lider/coordenador da equipe registrar que teve uma reuniao 1x1
-- com cada voluntario no mes. Alimenta indicadores como INTG-04 (% volunt.
-- com 1x1 mensal).
-- ============================================================================

CREATE TABLE IF NOT EXISTS vol_1x1_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_profile_id UUID NOT NULL REFERENCES vol_profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES vol_teams(id) ON DELETE SET NULL,
  meeting_date DATE NOT NULL,
  observacoes TEXT,
  registered_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vol_1x1_volunteer ON vol_1x1_meetings(volunteer_profile_id);
CREATE INDEX IF NOT EXISTS idx_vol_1x1_team ON vol_1x1_meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_vol_1x1_date ON vol_1x1_meetings(meeting_date DESC);

-- Garante 1 reuniao por voluntario por mes (para o calculo de % mensal)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vol_1x1_volunteer_month
  ON vol_1x1_meetings(volunteer_profile_id, date_trunc('month', meeting_date));

-- RLS: leitura para autenticados; escrita via service role (backend)
ALTER TABLE vol_1x1_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vol_1x1_read" ON vol_1x1_meetings;
CREATE POLICY "vol_1x1_read" ON vol_1x1_meetings FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- Marcar INTG-04 como auto-coletado
-- ============================================================================
UPDATE kpi_indicadores_taticos
SET fonte_auto = 'integracao.1x1_mensal',
    updated_at = now()
WHERE id = 'INTG-04';
