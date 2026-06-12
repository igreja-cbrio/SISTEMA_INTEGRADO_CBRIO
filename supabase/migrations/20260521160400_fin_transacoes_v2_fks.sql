-- Estrutura fiscal · estende fin_transacoes com plano de contas, centro de custo, culto
-- Backwards compatible · todas as colunas sao opcionais
-- A coluna legada `categoria_id` continua funcionando ate migracao completa

-- ============================================================
-- 1. NOVAS COLUNAS EM fin_transacoes
-- ============================================================
ALTER TABLE fin_transacoes
  ADD COLUMN IF NOT EXISTS plano_contas_id uuid REFERENCES fin_plano_contas(id),
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES fin_centros_custo(id),
  ADD COLUMN IF NOT EXISTS membro_id uuid REFERENCES mem_membros(id),
  ADD COLUMN IF NOT EXISTS lancamento_bruto_id uuid REFERENCES fin_lancamentos_brutos(id),
  ADD COLUMN IF NOT EXISTS pix_detalhe_id uuid REFERENCES fin_pix_detalhe(id),
  ADD COLUMN IF NOT EXISTS culto_slot_id uuid REFERENCES fin_culto_slots(id),
  ADD COLUMN IF NOT EXISTS hora_real time,
  ADD COLUMN IF NOT EXISTS classificacao_origem text CHECK (classificacao_origem IN ('manual', 'centavo', 'memoria', 'regra', 'ia', 'pix_match')),
  ADD COLUMN IF NOT EXISTS classificacao_confianca numeric CHECK (classificacao_confianca BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS identificador_centavo char(2);

CREATE INDEX IF NOT EXISTS fin_transacoes_plano_idx ON fin_transacoes(plano_contas_id) WHERE plano_contas_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_transacoes_centro_idx ON fin_transacoes(centro_custo_id) WHERE centro_custo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_transacoes_membro_idx ON fin_transacoes(membro_id) WHERE membro_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_transacoes_culto_idx ON fin_transacoes(culto_slot_id) WHERE culto_slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_transacoes_bruto_idx ON fin_transacoes(lancamento_bruto_id) WHERE lancamento_bruto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_transacoes_centavo_idx ON fin_transacoes(identificador_centavo) WHERE identificador_centavo IS NOT NULL;

-- ============================================================
-- 2. VIEW · transacoes com contexto fiscal completo
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_transacoes_completa AS
SELECT
  t.id,
  t.conta_id,
  t.tipo,
  t.descricao,
  t.valor,
  t.data_competencia,
  t.data_pagamento,
  t.status,
  t.referencia,
  t.observacoes,
  t.created_at,
  t.created_by,
  -- Plano de contas
  pc.codigo AS plano_contas_codigo,
  pc.nome AS plano_contas_nome,
  pc.tipo AS plano_contas_tipo,
  pc.natureza AS plano_contas_natureza,
  -- Centro de custo
  cc.codigo AS centro_custo_codigo,
  cc.nome AS centro_custo_nome,
  cc.campus AS centro_custo_campus,
  cc.area_slug AS centro_custo_area,
  -- Culto slot (se for receita classificada por culto)
  cs.nome AS culto_nome,
  cs.dia_semana AS culto_dia_semana,
  cs.service_type_slug AS culto_service_type_slug,
  -- Membro
  m.nome AS membro_nome,
  m.cpf AS membro_cpf,
  -- Metadata
  t.classificacao_origem,
  t.classificacao_confianca,
  t.identificador_centavo,
  t.hora_real,
  t.lancamento_bruto_id,
  t.pix_detalhe_id
FROM fin_transacoes t
LEFT JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
LEFT JOIN fin_centros_custo cc ON cc.id = t.centro_custo_id
LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
LEFT JOIN mem_membros m ON m.id = t.membro_id;

-- ============================================================
-- 3. VIEW · receita por culto/semana qua-ter
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_receita_por_culto AS
SELECT
  cs.id AS culto_slot_id,
  cs.nome AS culto_nome,
  cs.dia_semana,
  cs.service_type_slug,
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(t.data_competencia)).label AS semana_label,
  COUNT(*) AS qtd_lancamentos,
  SUM(t.valor) AS total_valor,
  SUM(CASE WHEN pc.codigo LIKE '3.01.01.%' THEN t.valor ELSE 0 END) AS total_dizimos,
  SUM(CASE WHEN pc.codigo LIKE '3.01.02.%' THEN t.valor ELSE 0 END) AS total_ofertas
FROM fin_transacoes t
LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
LEFT JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
WHERE t.tipo = 'receita'
  AND t.status != 'cancelado'
  AND t.culto_slot_id IS NOT NULL
GROUP BY cs.id, cs.nome, cs.dia_semana, cs.service_type_slug, t.data_competencia;

-- ============================================================
-- 4. VIEW · resumo semana qua-ter (DRE simplificado)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_resumo_semana AS
SELECT
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(t.data_competencia)).label AS semana_label,
  SUM(CASE WHEN t.tipo = 'receita' THEN t.valor ELSE 0 END) AS receitas,
  SUM(CASE WHEN t.tipo = 'despesa' THEN t.valor ELSE 0 END) AS despesas,
  SUM(CASE WHEN t.tipo = 'receita' THEN t.valor ELSE -t.valor END) AS resultado,
  COUNT(*) AS qtd_lancamentos,
  COUNT(*) FILTER (WHERE t.plano_contas_id IS NULL) AS qtd_nao_classificadas
FROM fin_transacoes t
WHERE t.status != 'cancelado'
GROUP BY (fin_semana_qua_ter(t.data_competencia)).inicio,
         (fin_semana_qua_ter(t.data_competencia)).fim,
         (fin_semana_qua_ter(t.data_competencia)).label;

COMMIT;
