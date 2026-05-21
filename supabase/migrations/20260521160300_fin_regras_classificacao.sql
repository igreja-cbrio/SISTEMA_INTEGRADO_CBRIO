-- Estrutura fiscal · Regras de classificacao + memoria historica
-- Engine de classificacao consulta nesta ordem:
--   1. identificador de centavo (config UI)
--   2. memoria historica (mesma contraparte/valor ja classificado X vezes)
--   3. regras regex/cnpj (config UI)
--   4. claude haiku (fallback IA)

-- ============================================================
-- 1. REGRAS DE CLASSIFICACAO (regex memo / cnpj fixo / palavra-chave)
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_regras_classificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo_regra text NOT NULL CHECK (tipo_regra IN ('regex_memo', 'cnpj_contraparte', 'palavra_chave', 'titularidade_pix')),
  pattern text NOT NULL,
  case_insensitive boolean NOT NULL DEFAULT true,
  aplica_a text NOT NULL CHECK (aplica_a IN ('credito', 'debito', 'ambos')),
  plano_contas_id uuid REFERENCES fin_plano_contas(id) ON DELETE RESTRICT,
  centro_custo_id uuid REFERENCES fin_centros_custo(id) ON DELETE SET NULL,
  membro_id uuid,                           -- vincular a um membro especifico (opcional)
  prioridade int NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS fin_regras_ativo_prio_idx ON fin_regras_classificacao(ativo, prioridade);

-- Seed de regras iniciais (despesas operacionais recorrentes)
WITH d AS (
  SELECT
    (SELECT id FROM fin_plano_contas WHERE codigo='4.14.04') AS tarifas,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.02.06.01') AS rendimento,
    (SELECT id FROM fin_plano_contas WHERE codigo='4.13.01') AS iof,
    (SELECT id FROM fin_plano_contas WHERE codigo='4.02.01') AS aluguel,
    (SELECT id FROM fin_plano_contas WHERE codigo='4.01.04.03') AS plano_saude,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.01.02.04') AS oferta_geral,
    (SELECT id FROM fin_plano_contas WHERE codigo='4.14.02') AS juros_mora,
    (SELECT id FROM fin_plano_contas WHERE codigo='3.02.06.03') AS resgate
)
INSERT INTO fin_regras_classificacao (nome, tipo_regra, pattern, aplica_a, plano_contas_id, prioridade, observacao)
SELECT * FROM (VALUES
  ('Tarifa pacote servicos',         'regex_memo',     'TARIFA MENSALIDADE PACOTE',     'debito', (SELECT tarifas FROM d),     10, 'Tarifa mensal do banco'),
  ('Tarifa extrato',                 'regex_memo',     'TARIFA EXTRATO',                'debito', (SELECT tarifas FROM d),     10, 'Tarifa de extrato impresso'),
  ('Tarifa avulsa PIX envio',        'regex_memo',     'TARIFA AVULSA ENVIO PIX',       'debito', (SELECT tarifas FROM d),     10, 'Tarifa PIX enviado'),
  ('Tarifa PIX recebido QR',         'regex_memo',     'TARIFA PIX RECEBIDO QR',        'debito', (SELECT tarifas FROM d),     10, 'Tarifa cobranca PIX'),
  ('Juros saldo utilizado',          'regex_memo',     'JUROS SALDO UTILIZ',            'debito', (SELECT juros_mora FROM d),  10, 'Juros de cheque especial'),
  ('Rendimento ContaMax',            'regex_memo',     'RENDIMENTO LIQUIDO DE CONTAMAX', 'credito', (SELECT rendimento FROM d), 10, 'Aplicacao automatica'),
  ('Resgate de aplicacao',           'regex_memo',     'RESGATE DE APLICACAO',          'credito', (SELECT resgate FROM d),     10, 'Resgate de aplicacao'),
  ('Antecipacao Getnet',             'regex_memo',     'ANTECIPACAO GETNET',            'credito', (SELECT oferta_geral FROM d), 20, 'Antecipacao cartao Getnet'),
  ('Cartao Getnet maestro/elo/visa', 'regex_memo',     'PAGAMENTO CARTAO DE DEBITO.*GETNET', 'credito', (SELECT oferta_geral FROM d), 20, 'Cartao presencial no culto'),
  ('Plano de saude AMIL',            'regex_memo',     'AMIL ASSISTENCIA MEDICA',       'debito', (SELECT plano_saude FROM d), 30, 'Plano de saude funcionarios')
) AS v(nome, tipo_regra, pattern, aplica_a, plano_contas_id, prioridade, observacao)
WHERE NOT EXISTS (
  SELECT 1 FROM fin_regras_classificacao WHERE nome = v.nome
);

-- ============================================================
-- 2. MEMORIA HISTORICA · classificacoes passadas viram sugestoes
-- ============================================================
-- Cada vez que admin classifica manualmente, sistema aprende.
-- Sugestao: se contraparte X foi classificada N vezes pra conta Y, sugere Y.
CREATE TABLE IF NOT EXISTS fin_memoria_classificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_contraparte text NOT NULL,          -- documento OR nome normalizado
  tipo_chave text NOT NULL CHECK (tipo_chave IN ('documento', 'nome', 'memo_pattern')),
  plano_contas_id uuid NOT NULL REFERENCES fin_plano_contas(id),
  centro_custo_id uuid REFERENCES fin_centros_custo(id),
  ocorrencias int NOT NULL DEFAULT 1,
  ultimo_uso timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chave_contraparte, tipo_chave, plano_contas_id)
);

CREATE INDEX IF NOT EXISTS fin_memoria_chave_idx ON fin_memoria_classificacao(chave_contraparte, tipo_chave);

-- ============================================================
-- 3. FILA DE CLASSIFICACAO · pra admin revisar transacoes ambiguas
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_fila_classificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_bruto_id uuid NOT NULL REFERENCES fin_lancamentos_brutos(id) ON DELETE CASCADE,
  sugestao_plano_contas_id uuid REFERENCES fin_plano_contas(id),
  sugestao_centro_custo_id uuid REFERENCES fin_centros_custo(id),
  sugestao_membro_id uuid,
  sugestao_origem text CHECK (sugestao_origem IN ('centavo', 'memoria', 'regra', 'ia', 'manual')),
  sugestao_confianca numeric CHECK (sugestao_confianca BETWEEN 0 AND 1),
  sugestao_explicacao text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'editado', 'ignorado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  decidido_por uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS fin_fila_status_idx ON fin_fila_classificacao(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fin_fila_lanc_uq ON fin_fila_classificacao(lancamento_bruto_id) WHERE status = 'pendente';

COMMIT;
