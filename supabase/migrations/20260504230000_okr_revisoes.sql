-- ============================================================================
-- OKR Revisoes: regra de ouro do ritual mensal (Gap 3)
--
-- Pedido do Marcos / ritual estrategico:
--   "Todo desvio deve gerar causa, decisao, responsavel e proximo passo."
--
-- Cada vez que um OKR (kpi_indicadores_taticos.is_okr=true) esta fora do
-- alvo, o lider abre uma revisao registrando:
--   - Causa do desvio
--   - Decisao tomada
--   - Responsavel pelo proximo passo
--   - Proximo passo + prazo
--
-- A revisao fica 'aberta' ate o proximo passo ser cumprido (status='executada').
-- Painel de governanca mostra "X revisoes abertas" / "Y proximos passos
-- vencidos".
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS okr_revisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id text NOT NULL REFERENCES kpi_indicadores_taticos(id) ON DELETE CASCADE,
  -- Periodo coberto pela revisao (e.g. '2026-04', '2026-Q1', '2026-S1', '2026')
  periodo_referencia text NOT NULL,
  data_revisao date NOT NULL DEFAULT CURRENT_DATE,
  status_no_periodo text NOT NULL DEFAULT 'vermelho'
    CHECK (status_no_periodo IN ('verde','amarelo','vermelho','pendente')),

  -- Regra de ouro do ritual
  causa_desvio text NOT NULL,
  decisao text NOT NULL,
  responsavel_funcionario_id uuid REFERENCES rh_funcionarios(id) ON DELETE SET NULL,
  proximo_passo text,
  prazo_proximo_passo date,

  -- Controle de execucao
  status_revisao text NOT NULL DEFAULT 'aberta'
    CHECK (status_revisao IN ('aberta','executada','cancelada')),
  data_execucao date,
  observacao_execucao text,

  -- Auditoria
  criado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS okr_revisoes_kpi_idx ON okr_revisoes(kpi_id);
CREATE INDEX IF NOT EXISTS okr_revisoes_responsavel_idx ON okr_revisoes(responsavel_funcionario_id) WHERE responsavel_funcionario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS okr_revisoes_status_idx ON okr_revisoes(status_revisao);
CREATE INDEX IF NOT EXISTS okr_revisoes_periodo_idx ON okr_revisoes(periodo_referencia);
CREATE INDEX IF NOT EXISTS okr_revisoes_prazo_idx ON okr_revisoes(prazo_proximo_passo) WHERE status_revisao = 'aberta' AND prazo_proximo_passo IS NOT NULL;

-- Mesmo KPI no mesmo periodo so pode ter 1 revisao aberta por vez
CREATE UNIQUE INDEX IF NOT EXISTS okr_revisoes_kpi_periodo_aberta_uq
  ON okr_revisoes(kpi_id, periodo_referencia)
  WHERE status_revisao = 'aberta';

ALTER TABLE okr_revisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_okr_revisoes" ON okr_revisoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_okr_revisoes" ON okr_revisoes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_okr_revisoes" ON okr_revisoes
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_okr_revisoes" ON okr_revisoes
  FOR DELETE TO authenticated USING (true);

-- Trigger pra updated_at
CREATE OR REPLACE FUNCTION fn_okr_revisoes_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS okr_revisoes_set_updated_at ON okr_revisoes;
CREATE TRIGGER okr_revisoes_set_updated_at
  BEFORE UPDATE ON okr_revisoes
  FOR EACH ROW EXECUTE FUNCTION fn_okr_revisoes_updated_at();

-- ----------------------------------------------------------------------------
-- View: revisoes abertas + dados do KPI e funcionario responsavel
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_okr_revisoes_abertas;

CREATE VIEW vw_okr_revisoes_abertas AS
SELECT
  r.id, r.kpi_id, r.periodo_referencia, r.data_revisao, r.status_no_periodo,
  r.causa_desvio, r.decisao, r.proximo_passo, r.prazo_proximo_passo,
  r.responsavel_funcionario_id, r.status_revisao, r.created_at,
  k.indicador AS kpi_nome,
  k.area AS kpi_area,
  k.valores AS kpi_valores,
  k.is_okr,
  f.nome AS responsavel_nome,
  f.cargo AS responsavel_cargo,
  CASE
    WHEN r.prazo_proximo_passo IS NULL THEN 'sem_prazo'
    WHEN r.prazo_proximo_passo < CURRENT_DATE THEN 'vencido'
    WHEN r.prazo_proximo_passo <= CURRENT_DATE + INTERVAL '7 days' THEN 'proximo'
    ELSE 'em_dia'
  END AS prazo_status
FROM okr_revisoes r
JOIN kpi_indicadores_taticos k ON k.id = r.kpi_id
LEFT JOIN rh_funcionarios f ON f.id = r.responsavel_funcionario_id
WHERE r.status_revisao = 'aberta';

-- Validacoes:
-- SELECT count(*) FROM okr_revisoes;
-- esperado: 0 (tabela vazia inicialmente)
-- SELECT * FROM vw_okr_revisoes_abertas;
-- esperado: vazio

COMMIT;
