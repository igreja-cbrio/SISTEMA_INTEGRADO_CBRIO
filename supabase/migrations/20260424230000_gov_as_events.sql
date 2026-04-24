-- Governança como eventos reais com ciclo criativo próprio.
-- Templates de fase filtrados por category_id do evento.

-- 0. Atualizar check constraint de area para incluir 'governanca'
ALTER TABLE cycle_phase_templates DROP CONSTRAINT IF EXISTS cycle_phase_templates_area_check;
ALTER TABLE cycle_phase_templates ADD CONSTRAINT cycle_phase_templates_area_check CHECK (area = ANY (ARRAY['marketing', 'ambos', 'governanca']));

-- 1. Adicionar category_id nos templates de fase (NULL = criativo, padrão)
ALTER TABLE cycle_phase_templates ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES event_categories(id);

-- 2. Adicionar category_id nos templates de tarefa
ALTER TABLE adm_task_templates ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES event_categories(id);

-- 3. Criar categoria Governança
INSERT INTO event_categories (id, name, color, active, sort_order)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Governanca', '#7c3aed', true, 99)
ON CONFLICT (id) DO UPDATE SET name = 'Governanca', color = '#7c3aed', active = true;

-- 4. Criar templates de fase de governança (6 fases em vez de 11)
INSERT INTO cycle_phase_templates (numero, nome, area, semanas_inicio, semanas_fim, momento_chave, descricao, category_id)
VALUES
  (1, 'OKR',                    'governanca', 0,   6,  true,  'Revisao de Objectives & Key Results (1a quarta do mes)',   'a0000000-0000-0000-0000-000000000001'),
  (2, 'DRE',                    'governanca', 7,   13, true,  'Demonstrativo de Resultado do Exercicio (2a quarta)',      'a0000000-0000-0000-0000-000000000001'),
  (3, 'KPI',                    'governanca', 14,  20, true,  'Revisao de Indicadores de Performance (3a quarta)',        'a0000000-0000-0000-0000-000000000001'),
  (4, 'Conselho Consultivo',    'governanca', 21,  27, true,  'Reuniao do Conselho Consultivo (4a quarta)',               'a0000000-0000-0000-0000-000000000001'),
  (5, 'Diretoria Estatutaria',  'governanca', 0,   6,  false, 'Reuniao quadrimestral da Diretoria (meses 1,5,9)',        'a0000000-0000-0000-0000-000000000001'),
  (6, 'Assembleia Geral',       'governanca', 0,   6,  false, 'Assembleia semestral com a Igreja (meses 6,12)',           'a0000000-0000-0000-0000-000000000001');

-- 5. Criar templates de tarefa para cada fase de governança
-- OKR
INSERT INTO adm_task_templates (area, etapa, titulo, offset_start, offset_end, sort_order, category_id) VALUES
  ('governanca', 'OKR', 'Consolidar status dos OKRs',        -5, -3, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'OKR', 'Preparar apresentacao OKR',         -3, -1, 2, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'OKR', 'Enviar pauta aos participantes',    -1, 0,  3, 'a0000000-0000-0000-0000-000000000001');
-- DRE
INSERT INTO adm_task_templates (area, etapa, titulo, offset_start, offset_end, sort_order, category_id) VALUES
  ('governanca', 'DRE', 'Fechar balancete do mes',           -7, -5, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'DRE', 'Preparar apresentacao DRE',         -3, -1, 2, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'DRE', 'Enviar pauta aos participantes',    -1, 0,  3, 'a0000000-0000-0000-0000-000000000001');
-- KPI
INSERT INTO adm_task_templates (area, etapa, titulo, offset_start, offset_end, sort_order, category_id) VALUES
  ('governanca', 'KPI', 'Coletar KPIs dos modulos',          -5, -3, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'KPI', 'Preparar apresentacao KPI',         -3, -1, 2, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'KPI', 'Enviar pauta aos participantes',    -1, 0,  3, 'a0000000-0000-0000-0000-000000000001');
-- Conselho Consultivo
INSERT INTO adm_task_templates (area, etapa, titulo, offset_start, offset_end, sort_order, category_id) VALUES
  ('governanca', 'Conselho Consultivo', 'Preparar relatorio executivo',      -7, -5, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'Conselho Consultivo', 'Consolidar pendencias anteriores',  -5, -3, 2, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'Conselho Consultivo', 'Preparar apresentacao Conselho',    -3, -1, 3, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'Conselho Consultivo', 'Enviar pauta aos participantes',    -1, 0,  4, 'a0000000-0000-0000-0000-000000000001');
-- Diretoria Estatutaria
INSERT INTO adm_task_templates (area, etapa, titulo, offset_start, offset_end, sort_order, category_id) VALUES
  ('governanca', 'Diretoria Estatutaria', 'Preparar relatorio diretoria',    -10, -5, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'Diretoria Estatutaria', 'Enviar convocacao e pauta',       -5, -1,  2, 'a0000000-0000-0000-0000-000000000001');
-- Assembleia Geral
INSERT INTO adm_task_templates (area, etapa, titulo, offset_start, offset_end, sort_order, category_id) VALUES
  ('governanca', 'Assembleia Geral', 'Preparar prestacao de contas',         -14, -7, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'Assembleia Geral', 'Preparar material para assembleia',    -7, -3,  2, 'a0000000-0000-0000-0000-000000000001'),
  ('governanca', 'Assembleia Geral', 'Divulgar convocacao',                  -5, -1,  3, 'a0000000-0000-0000-0000-000000000001');
