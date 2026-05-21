-- F · Recorrencias + DRE auto
-- Adiciona estrutura pra detectar despesas recorrentes (fixas/variaveis/eventuais)
-- e montar DRE mensal automatico a partir do plano de contas hierarquico.
-- Idempotente.

-- ============================================================
-- 1. Classifica plano de contas em fixa/variavel/eventual
-- ============================================================
ALTER TABLE fin_plano_contas
  ADD COLUMN IF NOT EXISTS classe text CHECK (classe IN ('fixa', 'variavel', 'eventual', NULL));

-- Defaults baseados em conhecimento do dominio:
-- Fixas: aluguel, condominio, energia, agua, telefonia, salarios, plano saude,
--        assessoria, IPTU, leasing, software/licencas, seguros
-- Variaveis: combustivel, materiais consumo, lanches, viagens, manutencao
-- Eventuais: eventos, marketing, doacoes, missoes, patrimoniais, juridicas
UPDATE fin_plano_contas SET classe = 'fixa' WHERE codigo IN (
  '4.01.01.01', '4.01.01.02', '4.01.01.05', '4.01.01.06', '4.01.01.08', '4.01.01.09',
  '4.01.01.10', '4.01.01.11', '4.01.04.01', '4.01.04.02', '4.01.04.03', '4.01.04.04', '4.01.04.05',
  '4.02.01', '4.02.02', '4.02.03', '4.02.04', '4.02.05', '4.02.06.01', '4.02.06.02', '4.02.06.03',
  '4.02.07', '4.02.09', '4.02.10',
  '4.03.01.01', '4.03.01.02',
  '4.08.01', '4.08.02', '4.08.03', '4.08.06',
  '4.12.06.02',
  '4.14.04', '4.14.05'
) AND classe IS NULL;

UPDATE fin_plano_contas SET classe = 'variavel' WHERE codigo IN (
  '4.01.01.04', '4.01.01.15', '4.01.01.17', '4.01.01.19', '4.01.01.20',
  '4.02.08.01', '4.02.08.02', '4.02.08.03', '4.02.08.04', '4.02.08.05',
  '4.03.01.04', '4.03.01.05', '4.03.01.06', '4.03.01.07', '4.03.01.08',
  '4.03.02.01', '4.03.02.02',
  '4.06.01', '4.06.02.01', '4.06.02.02', '4.06.03', '4.06.04', '4.06.05', '4.06.06',
  '4.06.07', '4.06.08', '4.06.09', '4.06.10',
  '4.07.01.01', '4.07.01.02', '4.07.01.03', '4.07.02', '4.07.03', '4.07.04', '4.07.05',
  '4.07.06', '4.07.07',
  '4.08.04', '4.08.05', '4.08.07',
  '4.12.04', '4.12.05', '4.12.07.01', '4.12.07.04',
  '4.14.02', '4.14.03', '4.14.06'
) AND classe IS NULL;

UPDATE fin_plano_contas SET classe = 'eventual' WHERE codigo IN (
  '4.01.02.03', '4.01.02.07.01', '4.01.02.07.02', '4.01.02.08', '4.01.02.09',
  '4.04.01', '4.04.02', '4.04.03',
  '4.05.01.01', '4.05.01.02', '4.05.01.03', '4.05.01.04', '4.05.02', '4.05.03', '4.05.04',
  '4.09.01', '4.09.02', '4.09.03', '4.09.04', '4.09.05', '4.09.06', '4.09.07', '4.09.08',
  '4.09.09', '4.09.10', '4.09.11',
  '4.10.01', '4.10.02', '4.10.03', '4.10.04', '4.10.05', '4.10.06', '4.10.07', '4.10.08', '4.10.09',
  '4.11.01', '4.11.02', '4.11.03', '4.11.04',
  '4.12.01', '4.12.02', '4.12.03', '4.12.07.02', '4.12.07.03',
  '4.12.08.01', '4.12.08.02', '4.12.08.03',
  '4.12.09.01', '4.12.09.02', '4.12.09.03', '4.12.10',
  '4.13.01', '4.14.01', '4.14.07', '4.15'
) AND classe IS NULL;

-- ============================================================
-- 2. Despesas recorrentes detectadas
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_despesas_recorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_match text NOT NULL,                -- documento OR nome normalizado
  tipo_chave text NOT NULL CHECK (tipo_chave IN ('documento', 'nome')),
  descricao text NOT NULL,
  valor_medio numeric(18, 2) NOT NULL,
  valor_minimo numeric(18, 2) NOT NULL,
  valor_maximo numeric(18, 2) NOT NULL,
  cadencia_dias int NOT NULL DEFAULT 30,
  ocorrencias int NOT NULL DEFAULT 0,
  ultima_ocorrencia date,
  proxima_estimada date,
  plano_contas_id uuid REFERENCES fin_plano_contas(id),
  classe text CHECK (classe IN ('fixa', 'variavel', 'eventual')) DEFAULT 'fixa',
  ativa boolean NOT NULL DEFAULT true,
  confirmada boolean NOT NULL DEFAULT false,
  confianca numeric NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chave_match, tipo_chave)
);

CREATE INDEX IF NOT EXISTS fin_recorrentes_ativa_idx ON fin_despesas_recorrentes(ativa, proxima_estimada);
CREATE INDEX IF NOT EXISTS fin_recorrentes_plano_idx ON fin_despesas_recorrentes(plano_contas_id);

-- Liga transacoes a uma recorrencia (FK soft)
ALTER TABLE fin_transacoes
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid REFERENCES fin_despesas_recorrentes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fin_transacoes_recorrencia_idx
  ON fin_transacoes(recorrencia_id) WHERE recorrencia_id IS NOT NULL;

-- ============================================================
-- 3. View · DRE mensal hierarquico
-- ============================================================
-- Agrupa fin_transacoes por mes + nivel 2 do plano de contas
-- Filtra cancelados, mostra cada categoria com subtotal e total
CREATE OR REPLACE VIEW vw_fin_dre_mensal AS
SELECT
  to_char(t.data_competencia, 'YYYY-MM') AS mes,
  pc.tipo AS tipo,                                       -- receita | despesa
  pc.natureza AS natureza,                               -- ordinaria | extraordinaria | patrimonial | financeira
  pc.classe AS classe,                                   -- fixa | variavel | eventual
  split_part(pc.codigo, '.', 1) || '.' || split_part(pc.codigo, '.', 2) AS grupo_codigo,
  pc.codigo AS plano_codigo,
  pc.nome AS plano_nome,
  COUNT(*) AS qtd_lancamentos,
  SUM(t.valor) AS total
FROM fin_transacoes t
JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
WHERE t.status != 'cancelado'
GROUP BY mes, pc.tipo, pc.natureza, pc.classe, grupo_codigo, pc.codigo, pc.nome;

-- ============================================================
-- 4. View · resumo mensal por classe (fixa/variavel/eventual)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_dre_classe AS
SELECT
  to_char(t.data_competencia, 'YYYY-MM') AS mes,
  pc.tipo,
  COALESCE(pc.classe, 'sem_classe') AS classe,
  COUNT(*) AS qtd,
  SUM(t.valor) AS total
FROM fin_transacoes t
JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
WHERE t.status != 'cancelado'
GROUP BY mes, pc.tipo, pc.classe;

COMMIT;
