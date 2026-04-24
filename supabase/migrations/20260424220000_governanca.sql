-- Módulo de Governança — Ciclo mensal de 4 reuniões interligadas
-- OKR (sem 1) → DRE (sem 2) → KPI (sem 3) → Conselho (sem 4)

-- Ciclo mensal (um por mês)
CREATE TABLE IF NOT EXISTS governance_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (year, month)
);

-- Tipos de reunião
CREATE TABLE IF NOT EXISTS governance_meeting_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  sigla TEXT NOT NULL UNIQUE,
  semana INT NOT NULL CHECK (semana BETWEEN 1 AND 5),
  cor TEXT DEFAULT '#00B39D',
  descricao TEXT,
  recorrencia TEXT NOT NULL DEFAULT 'mensal' CHECK (recorrencia IN ('mensal', 'quadrimestral', 'semestral')),
  ativo BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Seed dos 4 tipos + 2 extras
INSERT INTO governance_meeting_types (nome, sigla, semana, cor, descricao, recorrencia, sort_order) VALUES
  ('OKR', 'OKR', 1, '#3b82f6', 'Revisao de Objectives & Key Results', 'mensal', 1),
  ('DRE', 'DRE', 2, '#10b981', 'Demonstrativo de Resultado do Exercicio', 'mensal', 2),
  ('KPI', 'KPI', 3, '#f59e0b', 'Revisao de Indicadores de Performance', 'mensal', 3),
  ('Conselho Consultivo', 'CC', 4, '#8b5cf6', 'Reuniao do Conselho Consultivo', 'mensal', 4),
  ('Diretoria Estatutaria', 'DE', 1, '#ef4444', 'Reuniao da Diretoria Estatutaria', 'quadrimestral', 5),
  ('Assembleia Geral', 'AG', 1, '#06b6d4', 'Assembleia com a Igreja', 'semestral', 6)
ON CONFLICT (nome) DO NOTHING;

-- Reuniões (4+ por ciclo mensal)
CREATE TABLE IF NOT EXISTS governance_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES governance_cycles(id) ON DELETE CASCADE,
  type_id UUID NOT NULL REFERENCES governance_meeting_types(id),
  date DATE,
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'em_preparo', 'realizada', 'cancelada', 'adiada')),
  pauta TEXT,
  ata TEXT,
  deliberacoes TEXT,
  participantes TEXT[],
  quorum_presente INT,
  local TEXT,
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_meetings_cycle ON governance_meetings(cycle_id);

-- Tarefas/demandas por reunião
CREATE TABLE IF NOT EXISTS governance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES governance_meetings(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  responsavel TEXT,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  prioridade TEXT DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  origem TEXT,
  sort_order INT DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_tasks_meeting ON governance_tasks(meeting_id);

-- Templates de tarefas por tipo de reunião (demandas padrão)
CREATE TABLE IF NOT EXISTS governance_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id UUID NOT NULL REFERENCES governance_meeting_types(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  responsavel_padrao TEXT,
  prazo_offset_dias INT DEFAULT -3,
  prioridade TEXT DEFAULT 'normal',
  sort_order INT DEFAULT 0,
  ativo BOOLEAN DEFAULT true
);

-- Seed: demandas padrão por tipo de reunião
INSERT INTO governance_task_templates (type_id, titulo, descricao, prazo_offset_dias, sort_order)
SELECT t.id, tmpl.titulo, tmpl.descricao, tmpl.off, tmpl.ord
FROM governance_meeting_types t
CROSS JOIN (VALUES
  -- OKR
  ('OKR', 'Consolidar status dos OKRs', 'Atualizar progresso de cada KR no sistema', -3, 1),
  ('OKR', 'Preparar apresentacao OKR', 'Montar slides com status atual dos objetivos', -2, 2),
  ('OKR', 'Enviar pauta aos participantes', 'Distribuir pauta e dados previamente', -1, 3),
  -- DRE
  ('DRE', 'Fechar balancete do mes', 'Consolidar receitas e despesas no financeiro', -5, 1),
  ('DRE', 'Preparar apresentacao DRE', 'Montar comparativo planejado vs realizado', -2, 2),
  ('DRE', 'Enviar pauta aos participantes', 'Distribuir pauta e dados previamente', -1, 3),
  -- KPI
  ('KPI', 'Coletar KPIs dos modulos', 'Extrair metricas de cada area do sistema', -3, 1),
  ('KPI', 'Preparar apresentacao KPI', 'Montar dashboard com indicadores consolidados', -2, 2),
  ('KPI', 'Enviar pauta aos participantes', 'Distribuir pauta e dados previamente', -1, 3),
  -- Conselho
  ('CC', 'Preparar relatorio executivo', 'Resumo do mes: OKR + DRE + KPI + decisoes', -5, 1),
  ('CC', 'Consolidar pendencias anteriores', 'Status de todas as pendencias do conselho anterior', -3, 2),
  ('CC', 'Preparar apresentacao Conselho', 'Apresentacao consolidada para o conselho', -2, 3),
  ('CC', 'Enviar pauta aos participantes', 'Distribuir pauta e material de suporte', -1, 4)
) AS tmpl(sigla, titulo, descricao, off, ord)
WHERE t.sigla = tmpl.sigla;
