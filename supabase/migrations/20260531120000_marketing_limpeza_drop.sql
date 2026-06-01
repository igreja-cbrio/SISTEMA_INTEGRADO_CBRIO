-- ============================================================================
-- Marketing · limpeza pós-redesenho (2026-05-31)
-- DROP do que ficou morto na migração horas→slots e balcão→triagem:
--   - fn_marketing_calcular_capacidade_semana (capacidade em HORAS · sem chamador;
--     endpoint /capacidade removido; DEM-CAP reescrito em slots no kpiAutoCollector)
--   - fn_marketing_estimar_prazo (estimativa preliminar do intake antigo · sem chamador;
--     endpoint /estimar removido; intake por dor não escolhe mais o tipo)
--   - marketing_grupo_padrao (auto-assign por grupo · a triagem do Pedro substituiu;
--     nenhum trigger lê mais · a F2 recriou fn_marketing_cards_solicitacao_sync sem o JOIN)
--
-- DROP por nome (DO block) p/ pegar qualquer assinatura sobrecarregada das funções
-- (essas funções foram CREATE OR REPLACE várias vezes · ver feedback de overload).
-- Idempotente.
-- ============================================================================
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname IN ('fn_marketing_calcular_capacidade_semana', 'fn_marketing_estimar_prazo')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.marketing_grupo_padrao;

COMMIT;
