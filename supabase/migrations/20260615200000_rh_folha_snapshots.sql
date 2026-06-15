-- ============================================================
-- Snapshot mensal da folha (caminho B · exatidão daqui pra frente)
-- ------------------------------------------------------------
-- O sistema não guardava o valor da folha mês a mês (sempre calculava com o
-- salário ATUAL). Esta tabela fotografa o total da folha por mês: o cron diário
-- (gerarTodasNotificacoes → snapshotFolhaMensal) faz UPSERT no mês corrente, então
-- o mês atual reflete "agora" e os meses passados ficam congelados no fim do mês.
-- Sem reconstrução do passado — o gráfico começa no mês atual e enche com o tempo.
--
-- Dado sensível (folha agregada): RLS deixa SÓ o service_role ler/gravar. O
-- frontend acessa via GET /rh/dashboard/series, gated por podeEditarRemuneracao.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rh_folha_snapshots (
  mes            date PRIMARY KEY,                 -- 1º dia do mês (ex.: 2026-06-01)
  total_salarios numeric(14,2) NOT NULL DEFAULT 0, -- soma salário dos ativos
  total_custo    numeric(14,2) NOT NULL DEFAULT 0, -- soma custo_total_mensal (fallback salário)
  headcount      int NOT NULL DEFAULT 0,           -- nº de ativos no momento do snapshot
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rh_folha_snapshots IS
  'Foto mensal da folha (soma salário/custo dos ativos). UPSERT do mês corrente pelo cron diário · exatidão daqui pra frente, sem reconstrução do passado.';

ALTER TABLE public.rh_folha_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rh_folha_snapshots_service ON public.rh_folha_snapshots;
CREATE POLICY rh_folha_snapshots_service ON public.rh_folha_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed do mês corrente pra o gráfico não nascer vazio.
INSERT INTO public.rh_folha_snapshots (mes, total_salarios, total_custo, headcount)
SELECT date_trunc('month', current_date)::date,
       COALESCE(SUM(salario), 0),
       COALESCE(SUM(COALESCE(custo_total_mensal, salario)), 0),
       COUNT(*)
FROM public.rh_funcionarios
WHERE status = 'ativo' AND deleted_at IS NULL
ON CONFLICT (mes) DO UPDATE SET
  total_salarios = EXCLUDED.total_salarios,
  total_custo    = EXCLUDED.total_custo,
  headcount      = EXCLUDED.headcount,
  atualizado_em  = now();
