-- ============================================================================
-- Modulo de KPIs V2 - Hierarquia estrategica de 4 camadas
--
-- Camada 1: NSM (Norte Star Metric) - 1 metrica master, mensal, Diretores
-- Camada 2: Direcionadores - Ministerial Move, Geracionais, Criativo, Operacoes
-- Camada 3: KPIs Estrategicos - ~16 KPIs mensais com alvo, lideres ministeriais
-- Camada 4: Indicadores Taticos - ~55 indicadores por area, lancamento periodico
--
-- + Tabela de Registros (lancamentos dos taticos)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NSM (Norte Star Metric)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_nsm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INT NOT NULL,
  metrica TEXT NOT NULL,
  objetivo TEXT,
  alvo_descricao TEXT,
  alvo_valor NUMERIC,
  alvo_unidade TEXT,
  periodicidade TEXT NOT NULL DEFAULT 'mensal',
  area_responsavel TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ano)
);

-- ----------------------------------------------------------------------------
-- 2. Direcionadores (Pilares estrategicos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_direcionadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#00B39D',
  sort_order INT DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ano, codigo)
);

-- ----------------------------------------------------------------------------
-- 3. KPIs Estrategicos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_estrategicos (
  id TEXT PRIMARY KEY,
  direcionador_id UUID REFERENCES kpi_direcionadores(id) ON DELETE SET NULL,
  ano INT NOT NULL DEFAULT 2026,
  nome TEXT NOT NULL,
  objetivo TEXT,
  alvo_descricao TEXT,
  alvo_valor NUMERIC,
  alvo_unidade TEXT,
  periodicidade TEXT NOT NULL DEFAULT 'mensal',
  area_envolvida TEXT,
  ativo BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_estrategicos_direcionador ON kpi_estrategicos(direcionador_id);
CREATE INDEX IF NOT EXISTS idx_kpi_estrategicos_ano ON kpi_estrategicos(ano);

-- ----------------------------------------------------------------------------
-- 4. Indicadores Taticos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_indicadores_taticos (
  id TEXT PRIMARY KEY,
  kpi_estrategico_id TEXT REFERENCES kpi_estrategicos(id) ON DELETE SET NULL,
  area TEXT NOT NULL,
  indicador TEXT NOT NULL,
  periodicidade TEXT NOT NULL CHECK (periodicidade IN ('semanal', 'mensal', 'trimestral', 'semestral', 'anual')),
  meta_descricao TEXT,
  meta_valor NUMERIC,
  unidade TEXT,
  apuracao TEXT,
  responsavel_area TEXT,
  ativo BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  ano INT NOT NULL DEFAULT 2026,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_taticos_kpi ON kpi_indicadores_taticos(kpi_estrategico_id);
CREATE INDEX IF NOT EXISTS idx_kpi_taticos_area ON kpi_indicadores_taticos(area);

-- ----------------------------------------------------------------------------
-- 5. Registros (lancamentos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador_id TEXT NOT NULL REFERENCES kpi_indicadores_taticos(id) ON DELETE CASCADE,
  periodo_referencia TEXT NOT NULL,
  valor_realizado NUMERIC,
  valor_texto TEXT,
  data_preenchimento TIMESTAMPTZ DEFAULT now(),
  responsavel TEXT,
  user_id UUID,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_registros_indicador ON kpi_registros(indicador_id);
CREATE INDEX IF NOT EXISTS idx_kpi_registros_periodo ON kpi_registros(periodo_referencia);
CREATE INDEX IF NOT EXISTS idx_kpi_registros_data ON kpi_registros(data_preenchimento DESC);

-- Unique para evitar duplicar lancamento do mesmo indicador no mesmo periodo
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_registros_indicador_periodo
  ON kpi_registros(indicador_id, periodo_referencia);

-- ============================================================================
-- SEED 2026
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NSM 2026
-- ----------------------------------------------------------------------------
INSERT INTO kpi_nsm (ano, metrica, objetivo, alvo_descricao, alvo_valor, alvo_unidade, periodicidade, area_responsavel)
VALUES (
  2026,
  'Novos convertidos engajados em pelo menos um dos valores da CBRio em ate 60 dias da decisao',
  'Apurar se a missao esta sendo realizada de maneira eficaz, nao so alcancando, mas engajando em uma jornada de crescimento espiritual',
  '>=50%',
  50,
  '%',
  'mensal',
  'Diretores'
)
ON CONFLICT (ano) DO UPDATE SET
  metrica = EXCLUDED.metrica,
  objetivo = EXCLUDED.objetivo,
  alvo_descricao = EXCLUDED.alvo_descricao,
  alvo_valor = EXCLUDED.alvo_valor,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Direcionadores 2026
-- ----------------------------------------------------------------------------
INSERT INTO kpi_direcionadores (ano, codigo, nome, descricao, cor, sort_order) VALUES
  (2026, 'ministerial_move', 'Ministerial - Move a NSM', 'Move a NSM atraves do ministerio principal', '#00B39D', 1),
  (2026, 'geracionais', 'Ministerial - Geracionais', 'Geracionais (Kids, AMI, Bridge) movem a NSM', '#8B5CF6', 2),
  (2026, 'criativo', 'Criativo - Amplifica a NSM', 'Amplifica o alcance e a experiencia', '#F59E0B', 3),
  (2026, 'operacoes', 'Operacoes - Sustenta a NSM', 'Sustenta com estrutura, financas e cultura', '#3B82F6', 4),
  (2026, 'cba', 'CBA - Apoio Externo', 'Indicadores do ciclo CBA (igrejas parceiras)', '#EF4444', 5)
ON CONFLICT (ano, codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  cor = EXCLUDED.cor,
  sort_order = EXCLUDED.sort_order;

-- ----------------------------------------------------------------------------
-- KPIs Estrategicos 2026
-- ----------------------------------------------------------------------------
WITH d AS (
  SELECT id, codigo FROM kpi_direcionadores WHERE ano = 2026
)
INSERT INTO kpi_estrategicos (id, direcionador_id, nome, objetivo, alvo_descricao, alvo_valor, alvo_unidade, periodicidade, area_envolvida, sort_order)
SELECT * FROM (VALUES
  -- Ministerial Move
  ('MIN-CAFE', (SELECT id FROM d WHERE codigo = 'ministerial_move'),
    'Novos Convertidos presentes no Cafe',
    'Analisar a eficacia do funil de engajamento do novo convertido',
    '>=70% dos convertidos', 70, '%', 'mensal', 'Cuidados', 1),
  ('MIN-VALORES', (SELECT id FROM d WHERE codigo = 'ministerial_move'),
    'Engajamento nos Valores',
    'Avaliar engajamento dos membros no crescimento espiritual e no suporte ao crescimento da Igreja',
    '>=75% de toda igreja - 2 ou + valores', 75, '%', 'mensal', 'Grupos, Voluntariado e Generosidade', 2),
  ('MIN-BATISMOS', (SELECT id FROM d WHERE codigo = 'ministerial_move'),
    'Batismos Realizados',
    'Avaliar consolidacao da decisao tomada',
    '>=30% dos convertidos em 90 dias', 30, '%', 'mensal', 'Integracao', 3),
  -- Geracionais
  ('GER-FREQ', (SELECT id FROM d WHERE codigo = 'geracionais'),
    'Frequencia Geracionais',
    'Garantir engajamento de criancas, adolescentes e jovens',
    '80% dos membros em idade para participar', 80, '%', 'mensal', 'Geracionais', 1),
  ('GER-CONV', (SELECT id FROM d WHERE codigo = 'geracionais'),
    'Novos Convertidos Geracionais',
    'Manter a cultura de foco em alcancar pessoas para Jesus',
    '>=1% do publico-alvo presente', 1, '%', 'mensal', 'Geracionais', 2),
  ('GER-VALORES', (SELECT id FROM d WHERE codigo = 'geracionais'),
    'Engajamento nos Valores - AMI/Bridge',
    'Avaliar engajamento dos jovens nos valores da igreja',
    '>=75% de publico AMI e Bridge - 2 ou + valores', 75, '%', 'mensal', 'AMI e Bridge', 3),
  ('GER-FAMILIAS', (SELECT id FROM d WHERE codigo = 'geracionais'),
    'Familias Engajadas',
    'Garantir integracao e transbordo das licoes para os familiares',
    '>=80% das familias recorrentes levando devocionais', 80, '%', 'mensal', 'Kids', 4),
  ('GER-BATISMOS', (SELECT id FROM d WHERE codigo = 'geracionais'),
    'Batismos Geracionais',
    'Avaliar consolidacao da decisao - Criancas acima de 7 anos',
    '>=30% dos convertidos em 90 dias', 30, '%', 'mensal', 'Geracionais', 5),
  -- Criativo
  ('CRI-ALCANCE', (SELECT id FROM d WHERE codigo = 'criativo'),
    'Alcance Culto Online',
    'Ampliar o alcance da mensagem da igreja por meio do culto online',
    '+20% YoY', 20, '%YoY', 'mensal', 'Online / Producao / Marketing', 1),
  ('CRI-PRESENCIAL', (SELECT id FROM d WHERE codigo = 'criativo'),
    'Experiencia Presencial',
    'Proporcionar experiencia presencial fluida, acolhedora e tecnicamente excelente',
    '+20% YoY', 20, '%YoY', 'mensal', 'Producao / Adoracao / Marketing / Online', 2),
  ('CRI-CONTEUDO', (SELECT id FROM d WHERE codigo = 'criativo'),
    'Engajamento de Conteudo',
    'Estimular interacao da igreja com conteudos institucionais',
    '+25% YoY', 25, '%YoY', 'mensal', 'Marketing / Online', 3),
  ('CRI-OPERACIONAL', (SELECT id FROM d WHERE codigo = 'criativo'),
    'Excelencia Operacional',
    'Assegurar execucao tecnica e operacional dos cultos com excelencia',
    '>=95% de estabilidade operacional', 95, '%', 'mensal', 'Producao', 4),
  ('CRI-PROCESSOS', (SELECT id FROM d WHERE codigo = 'criativo'),
    'Processos Criativos',
    'Consolidar o processo criativo, garantindo cumprimento dos prazos',
    '>=90%', 90, '%', 'semestral', 'Diretoria Criativa, Marketing, Producao, Online e Adoracao', 5),
  -- Operacoes
  ('OPE-FINANCEIRO', (SELECT id FROM d WHERE codigo = 'operacoes'),
    'Eficiencia Financeira',
    'Consolidar planejamento financeiro com maior previsibilidade',
    '80% acertividade planejado x realizado', 80, '%', 'mensal', 'Gestao Estrategica/Financeiro', 1),
  ('OPE-CULTURA', (SELECT id FROM d WHERE codigo = 'operacoes'),
    'Cultura e Saude do Staff',
    'Melhorar o clima organizacional do staff CBRio',
    '>=4,3 no Q12', 4.3, 'nota', 'mensal', 'RH', 2),
  ('OPE-EXPANSAO', (SELECT id FROM d WHERE codigo = 'operacoes'),
    'Prontidao de Expansao e Estrutura',
    'Assegurar criticidade nas boas praticas correlatas a expansao',
    '80% cumprimento de cronograma', 80, '%', 'mensal', 'Gestao Estrategica/Infraestrutura', 3),
  -- CBA
  ('CBA-CICLO', (SELECT id FROM d WHERE codigo = 'cba'),
    'Ciclo CBA 2026',
    'Acompanhar o ciclo CBA com igrejas parceiras',
    'Crescimento 20%, Cultura 30%, Retencao 60%, NPS >=70', NULL, 'composto', 'mensal', 'CBA', 1)
) AS v(id, direcionador_id, nome, objetivo, alvo_descricao, alvo_valor, alvo_unidade, periodicidade, area_envolvida, sort_order)
ON CONFLICT (id) DO UPDATE SET
  direcionador_id = EXCLUDED.direcionador_id,
  nome = EXCLUDED.nome,
  objetivo = EXCLUDED.objetivo,
  alvo_descricao = EXCLUDED.alvo_descricao,
  alvo_valor = EXCLUDED.alvo_valor,
  alvo_unidade = EXCLUDED.alvo_unidade,
  periodicidade = EXCLUDED.periodicidade,
  area_envolvida = EXCLUDED.area_envolvida,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Indicadores Taticos 2026 (~55 indicadores)
-- ----------------------------------------------------------------------------
INSERT INTO kpi_indicadores_taticos (id, kpi_estrategico_id, area, indicador, periodicidade, meta_descricao, meta_valor, unidade, apuracao, responsavel_area, sort_order) VALUES
  -- AMI (9)
  ('AMI-01', 'GER-FREQ', 'ami', 'Frequencia AMI (presentes no culto)', 'semanal', '+15% em 6m, +30% em 12m (base 200)', 15, '%', 'Contagem presencial nos cultos AMI', 'Lideranca AMI', 1),
  ('AMI-02', 'GER-CONV', 'ami', 'Conversoes AMI', 'semanal', 'Monitorar', NULL, '#', 'Cards de decisao recolhidos no culto AMI', 'Lideranca AMI', 2),
  ('AMI-03', 'GER-VALORES', 'ami', 'Presenca Escola de Discipulos', 'semanal', '+50% em 6m (base 70/sem)', 50, '%', 'Lista de presenca semanal da Escola', 'Lideranca AMI', 3),
  ('AMI-04', 'GER-VALORES', 'ami', 'Presenca NEXT', 'mensal', 'Dobrar inscritos + 1 encontro/mes', NULL, '#', 'Lista de inscritos e presenca NEXT', 'Lideranca AMI', 4),
  ('AMI-05', 'GER-FREQ', 'ami', 'Frequencia Bridge', 'semanal', '+15% em 6m, +30% em 12m (conjunto AMI)', 15, '%', 'Contagem presencial Bridge', 'Lideranca Bridge', 5),
  ('AMI-06', 'GER-CONV', 'ami', 'Conversoes Bridge', 'semanal', 'Monitorar', NULL, '#', 'Cards de decisao Bridge', 'Lideranca Bridge', 6),
  ('AMI-07', 'GER-VALORES', 'ami', 'Presenca grupo de pais Bridge', 'semanal', 'Monitorar', NULL, '#', 'Lista de presenca grupo de pais', 'Lideranca Bridge', 7),
  ('AMI-08', 'GER-VALORES', 'ami', 'No grupos AMI / inscritos / lideres', 'mensal', '50% jovens em grupos (6m), 70% (12m)', 50, '%', 'Relatorio mensal supervisores', 'Lideranca AMI', 8),
  ('AMI-09', 'GER-BATISMOS', 'ami', 'Batismos AMI', 'mensal', '3/mes (1o sem) e 5/mes (2o sem)', 3, '#', 'Registro de batismos AMI', 'Lideranca AMI', 9),

  -- NEXT (4)
  ('NEXT-01', 'MIN-BATISMOS', 'next', '% Inscritos nao batizados convertidos em batizandos pos-NEXT', 'mensal', '30% no ciclo seguinte ao NEXT', 30, '%', 'Cruzamento NEXT x batismos', 'Coord NEXT', 1),
  ('NEXT-02', 'MIN-VALORES', 'next', '% Inscritos nao voluntarios convertidos em voluntarios pos-NEXT', 'mensal', '50% na semana pos-NEXT', 50, '%', 'Cruzamento NEXT x voluntariado', 'Coord NEXT', 2),
  ('NEXT-03', 'MIN-VALORES', 'next', '% Inscritos com registro de oferta/dizimo pos-NEXT', 'mensal', '30% nos 30 dias pos-NEXT', 30, '%', 'Cruzamento NEXT x doacoes', 'Coord NEXT', 3),
  ('NEXT-04', 'MIN-CAFE', 'next', 'NPS do NEXT', 'mensal', '>=70 ou 4,0', 70, 'nota', 'Pesquisa qualitativa pos-NEXT', 'Coord NEXT', 4),

  -- Generosidade (5)
  ('GEN-01', 'MIN-VALORES', 'generosidade', 'Crescimento no de doadores ativos', 'mensal', '20% vs 2025', 20, '%', 'Comparativo mensal x ano anterior', 'Generosidade', 1),
  ('GEN-02', 'MIN-VALORES', 'generosidade', '% Doadores ativos com recorrencia >=3 meses', 'mensal', '60% ao final do ano', 60, '%', 'Analise de recorrencia mensal', 'Generosidade', 2),
  ('GEN-03', 'MIN-VALORES', 'generosidade', '% Doadores Grupo C avancando para Grupo B', 'mensal', '30% ao longo do ciclo', 30, '%', 'Migracao entre grupos de doadores', 'Generosidade', 3),
  ('GEN-04', 'MIN-VALORES', 'generosidade', '% Participantes Next convertidos em doadores', 'mensal', '30% nos 30 dias pos-NEXT', 30, '%', 'Cruzamento NEXT x base doadores', 'Generosidade', 4),
  ('GEN-05', 'OPE-FINANCEIRO', 'generosidade', 'Valor total arrecadado no ciclo', 'mensal', 'Base para 2027', NULL, 'R$', 'Relatorio financeiro mensal', 'Generosidade', 5),

  -- CBKids (5)
  ('KID-01', 'GER-FREQ', 'kids', 'Frequencia criancas', 'semanal', 'Base 230', 230, '#', 'Check-in semanal CBKids', 'Lideranca Kids', 1),
  ('KID-02', 'GER-CONV', 'kids', 'Aceitacoes (criancas 5+)', 'mensal', 'A definir', NULL, '#', 'Registro por servo Kids', 'Lideranca Kids', 2),
  ('KID-03', 'GER-BATISMOS', 'kids', 'Batismos criancas (7+)', 'mensal', 'A definir', NULL, '#', 'Registro de batismos Kids', 'Lideranca Kids', 3),
  ('KID-04', 'GER-FAMILIAS', 'kids', 'Familias fazendo devocionais', 'mensal', '50 familias (6-12m)', 50, '#', 'Confirmacao via WhatsApp/formulario', 'Lideranca Kids', 4),
  ('KID-05', 'OPE-CULTURA', 'kids', 'Saida de voluntarios', 'mensal', '<=5 voluntarios', 5, '#', 'Contagem mensal de saidas', 'Lideranca Kids', 5),

  -- Cuidados (7)
  ('CUID-01', 'MIN-CAFE', 'cuidados', 'Novos convertidos atendidos pos-culto', 'semanal', '100%', 100, '%', 'Comparativo convertidos x atendidos', 'Coord Cuidados', 1),
  ('CUID-05', 'MIN-VALORES', 'cuidados', 'Novos convertidos engajados em ao menos um valor', 'mensal', '60% (6m)', 60, '%', 'Cruzamento decisao x grupos/voluntariado/doacao', 'Coord Cuidados', 2),
  ('CUID-06', 'MIN-VALORES', 'cuidados', '% de membros envolvidos em 2 ou + valores', 'mensal', '40% (6m)', 40, '%', 'Cruzamento de membros em multiplas areas', 'Coord Cuidados', 3),
  ('CUID-07', 'MIN-CAFE', 'cuidados', 'Encontros Jornada 180', 'semanal', '1/semana', 1, '#', 'Registro de encontros realizados', 'Coord Cuidados', 4),
  ('CUID-10', 'MIN-CAFE', 'cuidados', 'Atendimentos Capelania (enfermos/hosp)', 'mensal', '40%', 40, '%', 'Registro de visitas/atendimentos', 'Coord Cuidados', 5),
  ('CUID-12', 'OPE-CULTURA', 'cuidados', 'Papo com Pastor - staff atendido', 'mensal', '50%', 50, '%', 'Lista de atendimentos staff', 'Coord Cuidados', 6),
  ('CUID-14', 'MIN-CAFE', 'cuidados', 'Aconselhamentos', 'mensal', '30%', 30, '%', 'Registro mensal de sessoes', 'Coord Cuidados', 7),

  -- Grupos (5)
  ('GRUP-01', 'MIN-VALORES', 'grupos', 'No participantes em grupos', 'mensal', '+30% ano (base 1000)', 30, '%', 'Listas dos lideres consolidadas', 'Coord Grupos', 1),
  ('GRUP-02', 'MIN-VALORES', 'grupos', 'No lideres em treinamento', 'mensal', '+50% em 12m', 50, '%', 'Lista de lideres em formacao', 'Coord Grupos', 2),
  ('GRUP-03', 'MIN-VALORES', 'grupos', 'No lideres acompanhados', 'mensal', 'Monitorar', NULL, '#', 'Acompanhamento de supervisores', 'Coord Grupos', 3),
  ('GRUP-04', 'MIN-VALORES', 'grupos', 'No de grupos / inscritos', 'semestral', 'Monitorar', NULL, '#', 'Censo semestral de grupos', 'Coord Grupos', 4),
  ('GRUP-05', 'MIN-VALORES', 'grupos', '% Aprovacao lideres / Satisfacao', 'semestral', '90% / 90%', 90, '%', 'Pesquisa semestral', 'Coord Grupos', 5),

  -- Integracao (5)
  ('INTG-01', 'MIN-CAFE', 'integracao', 'No conversoes', 'semanal', 'Monitorar', NULL, '#', 'Cards de decisao por culto', 'Coord Integracao', 1),
  ('INTG-02', 'MIN-CAFE', 'integracao', 'No visitantes', 'semanal', 'Monitorar', NULL, '#', 'Cartao de visitante na recepcao', 'Coord Integracao', 2),
  ('INTG-04', 'MIN-VALORES', 'integracao', '% Voluntarios com 1x1 mensal', 'mensal', '100%', 100, '%', 'Registro de encontros 1x1', 'Coord Integracao', 3),
  ('INTG-05', 'MIN-VALORES', 'integracao', '% Voluntarios em treinamentos', 'mensal', '90%', 90, '%', 'Lista de presenca treinamentos', 'Coord Integracao', 4),
  ('INTG-06', 'MIN-CAFE', 'integracao', '% Acerto questionario trimestral', 'trimestral', '>80%', 80, '%', 'Aplicacao trimestral de questionario', 'Coord Integracao', 5),

  -- Voluntariado (9)
  ('VOL-01', 'MIN-VALORES', 'voluntariado', 'No voluntarios ativos (semanal)', 'semanal', 'Monitorar', NULL, '#', 'Check-in de voluntarios', 'Coord Voluntariado', 1),
  ('VOL-02', 'MIN-VALORES', 'voluntariado', 'No voluntarios ativos (mensal)', 'mensal', '30% igreja (6m), 40% (12m)', 30, '%', 'Voluntarios servindo no mes', 'Coord Voluntariado', 2),
  ('VOL-03', 'MIN-VALORES', 'voluntariado', 'No voluntarios ativos (trimestral)', 'trimestral', 'Monitorar', NULL, '#', 'Voluntarios ativos no trimestre', 'Coord Voluntariado', 3),
  ('VOL-04', 'MIN-VALORES', 'voluntariado', 'Novos voluntarios (entrantes)', 'mensal', 'Monitorar', NULL, '#', 'Registro de novos voluntarios', 'Coord Voluntariado', 4),
  ('VOL-05', 'MIN-VALORES', 'voluntariado', 'Voluntarios integrados', 'mensal', 'Monitorar', NULL, '#', 'Voluntarios apos integracao', 'Coord Voluntariado', 5),
  ('VOL-06', 'MIN-VALORES', 'voluntariado', 'Voluntarios no Services', 'mensal', '95% ativos escalados', 95, '%', 'Planning Center Services', 'Coord Voluntariado', 6),
  ('VOL-07', 'MIN-VALORES', 'voluntariado', 'Voluntarios desaparecidos', 'mensal', 'Recuperar 60%', 60, '%', 'Voluntarios sem escala 3+ meses', 'Coord Voluntariado', 7),
  ('VOL-08', 'MIN-VALORES', 'voluntariado', '% Interessados integrados', 'mensal', '90%', 90, '%', 'Funil de interesse a integracao', 'Coord Voluntariado', 8),
  ('VOL-09', 'OPE-CULTURA', 'voluntariado', 'Satisfacao voluntarios', 'semestral', '90% respostas positivas', 90, '%', 'Pesquisa semestral', 'Coord Voluntariado', 9),

  -- CBA (6)
  ('CBA-01', 'CBA-CICLO', 'cba', 'Crescimento no de igrejas CBA', 'anual', '20% vs 2025', 20, '%', 'Comparativo anual de inscritas', 'Coord CBA', 1),
  ('CBA-02', 'CBA-CICLO', 'cba', '% igrejas com implementacao cultural registrada', 'anual', '30% ao final do ciclo', 30, '%', 'Relatorio de implementacao por igreja', 'Coord CBA', 2),
  ('CBA-03', 'CBA-CICLO', 'cba', '% igrejas do ciclo anterior re-inscritas', 'anual', '60%', 60, '%', 'Comparativo de inscricoes ciclo anterior x atual', 'Coord CBA', 3),
  ('CBA-04', 'CBA-CICLO', 'cba', 'Valor arrecadado Make a Difference', 'anual', 'Base para 2027', NULL, 'R$', 'Relatorio financeiro Make a Difference', 'Coord CBA', 4),
  ('CBA-05', 'CBA-CICLO', 'cba', '% igrejas ativas no Make a Difference', 'anual', '40% das inscritas', 40, '%', 'Relatorio de participacao Make a Difference', 'Coord CBA', 5),
  ('CBA-06', 'CBA-CICLO', 'cba', 'NPS do ciclo CBA', 'anual', '>=70 ou 4,0', 70, 'nota', 'Pesquisa qualitativa final do ciclo', 'Coord CBA', 6)
ON CONFLICT (id) DO UPDATE SET
  kpi_estrategico_id = EXCLUDED.kpi_estrategico_id,
  area = EXCLUDED.area,
  indicador = EXCLUDED.indicador,
  periodicidade = EXCLUDED.periodicidade,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  unidade = EXCLUDED.unidade,
  apuracao = EXCLUDED.apuracao,
  responsavel_area = EXCLUDED.responsavel_area,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ============================================================================
-- VIEW de status (calcula verde/amarelo/vermelho automaticamente)
-- ============================================================================
CREATE OR REPLACE VIEW vw_kpi_taticos_status AS
WITH ultimo_registro AS (
  SELECT DISTINCT ON (indicador_id)
    indicador_id,
    periodo_referencia,
    valor_realizado,
    data_preenchimento,
    responsavel,
    observacoes
  FROM kpi_registros
  ORDER BY indicador_id, data_preenchimento DESC
),
periodo_atual AS (
  SELECT
    'semanal' AS periodicidade,
    to_char(now(), 'IYYY"-W"IW') AS periodo
  UNION ALL SELECT 'mensal', to_char(now(), 'YYYY-MM')
  UNION ALL SELECT 'trimestral', to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')
  UNION ALL SELECT 'semestral', to_char(now(), 'YYYY') || '-S' || (CASE WHEN extract(month FROM now()) <= 6 THEN '1' ELSE '2' END)
  UNION ALL SELECT 'anual', to_char(now(), 'YYYY')
)
SELECT
  t.id,
  t.kpi_estrategico_id,
  t.area,
  t.indicador,
  t.periodicidade,
  t.meta_descricao,
  t.meta_valor,
  t.unidade,
  t.responsavel_area,
  t.sort_order,
  pa.periodo AS periodo_atual,
  ur.periodo_referencia AS ultimo_periodo,
  ur.valor_realizado AS ultimo_valor,
  ur.data_preenchimento AS ultima_data,
  ur.responsavel AS ultimo_responsavel,
  CASE
    WHEN ur.periodo_referencia = pa.periodo THEN 'verde'
    WHEN ur.periodo_referencia IS NULL THEN 'pendente'
    ELSE 'vermelho'
  END AS status
FROM kpi_indicadores_taticos t
LEFT JOIN ultimo_registro ur ON ur.indicador_id = t.id
LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
WHERE t.ativo = true;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE kpi_nsm ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_direcionadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_estrategicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_indicadores_taticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_registros ENABLE ROW LEVEL SECURITY;

-- Leitura para todos os autenticados
DROP POLICY IF EXISTS "kpi_nsm_read" ON kpi_nsm;
CREATE POLICY "kpi_nsm_read" ON kpi_nsm FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kpi_direcionadores_read" ON kpi_direcionadores;
CREATE POLICY "kpi_direcionadores_read" ON kpi_direcionadores FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kpi_estrategicos_read" ON kpi_estrategicos;
CREATE POLICY "kpi_estrategicos_read" ON kpi_estrategicos FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kpi_taticos_read" ON kpi_indicadores_taticos;
CREATE POLICY "kpi_taticos_read" ON kpi_indicadores_taticos FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kpi_registros_read" ON kpi_registros;
CREATE POLICY "kpi_registros_read" ON kpi_registros FOR SELECT USING (auth.role() = 'authenticated');

-- Backend (service role) faz escritas - tem bypass de RLS
