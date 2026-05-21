-- H · Analises + previsao + alertas
-- Idempotente

-- ============================================================
-- 1. Tabela de alertas financeiros
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN (
    'queda_receita',
    'contribuinte_sumido',
    'despesa_fixa_atrasada',
    'composicao_mudou',
    'pico_anormal'
  )),
  severidade text NOT NULL CHECK (severidade IN ('info', 'aviso', 'critico')) DEFAULT 'aviso',
  titulo text NOT NULL,
  mensagem text NOT NULL,
  dados jsonb,                                 -- payload livre (valores, datas, ids)
  chave_dedup text NOT NULL,                   -- evita duplicar alerta no mesmo periodo
  recorrencia_id uuid REFERENCES fin_despesas_recorrentes(id) ON DELETE SET NULL,
  membro_id uuid REFERENCES mem_membros(id) ON DELETE SET NULL,
  atendido_em timestamptz,
  atendido_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  comentario_atendimento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave_dedup)
);

CREATE INDEX IF NOT EXISTS fin_alertas_pendentes_idx ON fin_alertas(severidade, created_at DESC)
  WHERE atendido_em IS NULL;
CREATE INDEX IF NOT EXISTS fin_alertas_tipo_idx ON fin_alertas(tipo);

-- ============================================================
-- 2. View · heatmap arrecadacao (dia da semana x hora)
-- ============================================================
-- Agrega receitas dos ultimos 12 meses por (dia_semana, hora)
-- pra renderizar heatmap "qual horario rende mais"
CREATE OR REPLACE VIEW vw_fin_heatmap_arrecadacao AS
WITH base AS (
  SELECT
    -- Prioriza hora_real (vinda do match PIX); fallback created_at do bruto
    COALESCE(
      EXTRACT(DOW FROM (t.data_competencia + COALESCE(t.hora_real, '00:00:00'::time)))::int,
      EXTRACT(DOW FROM t.data_competencia)::int
    ) AS dia_semana,
    EXTRACT(HOUR FROM COALESCE(t.hora_real, '12:00:00'::time))::int AS hora,
    t.valor
  FROM fin_transacoes t
  WHERE t.tipo = 'receita'
    AND t.status != 'cancelado'
    AND t.data_competencia >= CURRENT_DATE - INTERVAL '12 months'
)
SELECT
  dia_semana,                     -- 0=Dom, 1=Seg, ..., 6=Sab
  hora,                           -- 0-23
  SUM(valor) AS total,
  COUNT(*) AS qtd
FROM base
GROUP BY dia_semana, hora;

-- ============================================================
-- 3. View · receitas por semana (qua-ter) ultimos 26 periodos
-- ============================================================
-- Base do forecast e da deteccao de queda
CREATE OR REPLACE VIEW vw_fin_receita_semanal AS
SELECT
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(t.data_competencia)).label AS semana_label,
  SUM(t.valor) AS receita_total,
  COUNT(*) AS qtd_lancamentos
FROM fin_transacoes t
WHERE t.tipo = 'receita'
  AND t.status != 'cancelado'
GROUP BY semana_inicio, semana_fim, semana_label
ORDER BY semana_inicio DESC;

-- ============================================================
-- 4. View · contribuintes recorrentes que sumiram
-- ============================================================
-- Identifica membros que doavam pelo menos 3x nos ultimos 6 meses
-- e nao doam ha mais de 60 dias (provavel evasao)
CREATE OR REPLACE VIEW vw_fin_contribuintes_sumidos AS
WITH historico AS (
  SELECT
    t.membro_id,
    COUNT(*) AS doacoes_historico,
    SUM(t.valor) AS total_doado,
    MAX(t.data_competencia) AS ultima_doacao,
    AVG(t.valor) AS doacao_media
  FROM fin_transacoes t
  WHERE t.tipo = 'receita'
    AND t.status != 'cancelado'
    AND t.membro_id IS NOT NULL
    AND t.data_competencia >= CURRENT_DATE - INTERVAL '6 months'
  GROUP BY t.membro_id
)
SELECT
  h.membro_id,
  m.nome AS membro_nome,
  m.email,
  m.telefone,
  h.doacoes_historico,
  h.total_doado,
  h.ultima_doacao,
  h.doacao_media,
  (CURRENT_DATE - h.ultima_doacao)::int AS dias_sem_doar
FROM historico h
JOIN mem_membros m ON m.id = h.membro_id
WHERE h.doacoes_historico >= 3
  AND h.ultima_doacao < CURRENT_DATE - INTERVAL '60 days'
  AND m.deleted_at IS NULL
ORDER BY h.total_doado DESC;

COMMIT;
