-- Culto ao Vivo · ativa Supabase Realtime em fin_lancamentos_brutos
-- e cria view de stats por culto pra UI consumir
-- Idempotente

-- 1. Ativa Realtime na tabela de lancamentos brutos
-- Frontend pode subscrever via supabase.channel().on('postgres_changes',...)
DO $$
BEGIN
  -- Se ja esta na publicacao, ignore
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'fin_lancamentos_brutos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fin_lancamentos_brutos;
  END IF;
END$$;

-- 2. View · culto ativo agora (baseado em fin_culto_slots)
-- Retorna o slot que esta acontecendo neste momento ou NULL se nao ha culto
CREATE OR REPLACE VIEW vw_fin_culto_ativo AS
SELECT
  cs.id AS culto_slot_id,
  cs.nome AS culto_nome,
  cs.dia_semana,
  cs.hora_inicio,
  cs.hora_fim,
  cs.service_type_slug,
  -- janela do culto em datetime BRT (hoje)
  (CURRENT_DATE + cs.hora_inicio) AS janela_inicio,
  CASE
    WHEN cs.hora_fim_proximo_dia
    THEN (CURRENT_DATE + cs.hora_fim + INTERVAL '1 day')
    ELSE (CURRENT_DATE + cs.hora_fim)
  END AS janela_fim
FROM fin_culto_slots cs
WHERE cs.ativo
  AND cs.dia_semana = EXTRACT(DOW FROM CURRENT_DATE)::int
  AND (
    -- Janela normal · hora_atual entre inicio e fim
    (NOT cs.hora_fim_proximo_dia
     AND CURRENT_TIME >= cs.hora_inicio
     AND CURRENT_TIME < cs.hora_fim)
    OR
    -- Janela que cruza meia-noite · hora_atual >= inicio (mesmo dia)
    (cs.hora_fim_proximo_dia AND CURRENT_TIME >= cs.hora_inicio)
  )
ORDER BY cs.ordem
LIMIT 1;

-- 3. View · stats do culto atual (creditos PIX desde inicio da janela)
-- Soma valores recebidos no periodo do culto · usa created_at do bruto
-- porque PIX via API /statements nao tem hora exata
CREATE OR REPLACE VIEW vw_fin_culto_ao_vivo AS
WITH culto AS (
  SELECT * FROM vw_fin_culto_ativo
)
SELECT
  c.culto_slot_id,
  c.culto_nome,
  c.janela_inicio,
  c.janela_fim,
  c.service_type_slug,
  -- Stats do culto atual
  COALESCE(SUM(lb.valor) FILTER (WHERE lb.tipo_trn = 'CREDIT' AND lb.created_at >= c.janela_inicio), 0) AS total_culto,
  COUNT(*) FILTER (WHERE lb.tipo_trn = 'CREDIT' AND lb.created_at >= c.janela_inicio) AS qtd_culto,
  -- Stats do dia inteiro
  COALESCE(SUM(lb.valor) FILTER (WHERE lb.tipo_trn = 'CREDIT' AND lb.created_at::date = CURRENT_DATE), 0) AS total_dia,
  COUNT(*) FILTER (WHERE lb.tipo_trn = 'CREDIT' AND lb.created_at::date = CURRENT_DATE) AS qtd_dia,
  -- Stats da semana
  COALESCE(SUM(lb.valor) FILTER (WHERE lb.tipo_trn = 'CREDIT' AND lb.created_at >= date_trunc('week', CURRENT_DATE)), 0) AS total_semana,
  COUNT(*) FILTER (WHERE lb.tipo_trn = 'CREDIT' AND lb.created_at >= date_trunc('week', CURRENT_DATE)) AS qtd_semana
FROM culto c
LEFT JOIN fin_lancamentos_brutos lb ON true
GROUP BY c.culto_slot_id, c.culto_nome, c.janela_inicio, c.janela_fim, c.service_type_slug;

COMMIT;
