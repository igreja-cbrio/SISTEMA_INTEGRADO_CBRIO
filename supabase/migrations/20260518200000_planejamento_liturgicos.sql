-- ═════════════════════════════════════════════════════════════════════
-- Planejamento Anual — PR-C · templates litúrgicos
-- ═════════════════════════════════════════════════════════════════════
--
-- Eventos de liturgia se repetem todo ano sem mudança (batismos 4º domingo,
-- ceia 1º domingo, apresentação de bebês). Marcos NÃO quer passar esses
-- pelo ciclo de aprovação — devem ser materializados automaticamente
-- quando o admin "fechar" o ciclo do ano e clicar "Gerar calendário".
--
-- Cada template define um padrão de recorrência. Endpoint backend lê
-- esses templates e cria events em datas calculadas pra o ano N.

CREATE TABLE IF NOT EXISTS event_liturgia_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL,
  descricao           TEXT,
  area                TEXT,                          -- ex: 'ministerial'
  budget_default      NUMERIC(10,2) DEFAULT 0,
  recurrence_pattern  TEXT NOT NULL,                 -- ver convenção abaixo
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN event_liturgia_templates.recurrence_pattern IS
  'Convenção: 1st_sunday | 2nd_sunday | 3rd_sunday | 4th_sunday | last_sunday |
   monthly_day_DD (ex: monthly_day_15) | weekly_dayN (0=domingo,1=segunda,...)';

INSERT INTO event_liturgia_templates (nome, descricao, area, recurrence_pattern, budget_default) VALUES
  ('Ceia do Senhor', 'Comunhão no primeiro domingo de cada mês', 'ministerial', '1st_sunday', 0),
  ('Batismo', 'Batismo no quarto domingo de cada mês', 'ministerial', '4th_sunday', 0),
  ('Apresentação de bebês', 'Cerimônia mensal', 'ministerial', '2nd_sunday', 0)
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS event_liturgia_templates_updated_at ON event_liturgia_templates;
CREATE TRIGGER event_liturgia_templates_updated_at BEFORE UPDATE ON event_liturgia_templates
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

ALTER TABLE event_liturgia_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_liturgia_templates_auth ON event_liturgia_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
