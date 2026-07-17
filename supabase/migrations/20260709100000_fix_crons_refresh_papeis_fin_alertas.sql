-- ============================================================================
-- Fix dos crons diários quebrados (descobertos via telemetria · 2026-07-08)
-- Os 5 crons falhavam em silêncio há semanas; a telemetria (Onda 0) só passou
-- a capturar em 04/07 e os expôs. Este arquivo conserta os 2 que são de banco:
--
-- 1) /api/jornada/cron/refresh-papeis · a função refresh_vw_pessoas_papeis_mat
--    NÃO existe em prod (drift git↔prod: consta na migration 20260511100000,
--    mas o banco não a tem) → a matview da jornada/cruzamentos não atualiza.
--    Recriada idêntica (idempotente).
--
-- 2) /api/financeiro/alertas/cron-gerar · a tabela fin_alertas nasceu
--    (20260521270000) com CHECK de 5 tipos e a função gerar_alertas_financeiros
--    (20260522190000) gera 7 tipos DIFERENTES sem ter atualizado o CHECK →
--    o cron de alertas financeiros NUNCA rodou com sucesso. CHECK recriado com
--    a UNIÃO (tipos antigos preservam linhas históricas, se houver).
-- ============================================================================

-- ── 1. Função de refresh da matview da jornada (cron diário 05:00 UTC) ──────
CREATE OR REPLACE FUNCTION public.refresh_vw_pessoas_papeis_mat()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio timestamptz := now();
  v_total int;
BEGIN
  -- CONCURRENTLY · não bloqueia SELECTs concorrentes (unique index já existe)
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_pessoas_papeis_mat;
  SELECT count(*) INTO v_total FROM public.vw_pessoas_papeis_mat;
  RETURN jsonb_build_object(
    'total', v_total,
    'duracao_ms', extract(epoch from (now() - v_inicio)) * 1000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_vw_pessoas_papeis_mat() TO authenticated, service_role;

-- ── 2. fin_alertas · CHECK de tipo aceita os tipos que a função gera ────────
DO $$
DECLARE v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
   WHERE con.conrelid = 'public.fin_alertas'::regclass
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.fin_alertas DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'fin_alertas: CHECK % recriada com os tipos da função', v_name;
  END IF;
END $$;

ALTER TABLE public.fin_alertas ADD CONSTRAINT fin_alertas_tipo_check
  CHECK (tipo IN (
    -- gerados por gerar_alertas_financeiros (20260522190000 · os que valem hoje)
    'conta_vencida', 'conta_vencendo', 'saldo_baixo', 'saldo_projetado_negativo',
    'despesa_atipica', 'doador_parou', 'receita_baixa',
    -- tipos originais da criação da tabela (20260521270000 · linhas históricas)
    'queda_receita', 'contribuinte_sumido', 'despesa_fixa_atrasada',
    'composicao_mudou', 'pico_anormal'
  ));

COMMENT ON CONSTRAINT fin_alertas_tipo_check ON public.fin_alertas IS
  'União: 7 tipos gerados por gerar_alertas_financeiros + 5 tipos originais da criação da tabela (histórico). Ao criar tipo novo na função, incluir aqui.';
