-- ============================================================================
-- Grupos · NOVA RÉGUA de visitante/frequentador (Marcos 2026-07-23)
--
-- Com a frequência agora MENSAL, a régua antiga "3 presenças → frequentador"
-- não serve mais (e não temos histórico das temporadas antigas). Decisão:
--   1. TODAS as pessoas atuais nos grupos viram FREQUENTADOR (clima limpo).
--   2. Daqui pra frente, quem ENTRA novo entra como VISITANTE (default da
--      coluna, inalterado) e vira FREQUENTADOR na 1ª PRESENÇA confirmada
--      (antes exigia >3).
--
-- Só mexe em quem está como 'visitante' (roster ativo). Líderes/co-líderes/
-- supervisores/coordenadores/em-treino não são tocados. Idempotente.
-- ============================================================================

-- 1) Clima limpo: todo visitante ATIVO de hoje vira frequentador (não há dados
--    de presença das temporadas antigas pra decidir de outro jeito).
UPDATE public.mem_grupo_membros
   SET funcao = 'frequentador'
 WHERE funcao = 'visitante'
   AND saiu_em IS NULL
   AND deleted_at IS NULL;

-- 2) Trigger: promove visitante → frequentador na 1ª presença (>=1, era >3).
--    O default da coluna segue 'visitante' (novo entrante nasce visitante).
CREATE OR REPLACE FUNCTION public.fn_grupo_auto_membro()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1 presença confirmada já basta (frequência mensal · Marcos 2026-07-23).
  IF NEW.funcao = 'visitante' AND COALESCE(NEW.presencas, 0) >= 1 THEN
    NEW.funcao := 'frequentador';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger já existe (BEFORE INSERT OR UPDATE OF presencas, funcao) — recriar é
-- inócuo, mas garante o vínculo com a função nova.
DROP TRIGGER IF EXISTS tg_grupo_auto_membro ON public.mem_grupo_membros;
CREATE TRIGGER tg_grupo_auto_membro
  BEFORE INSERT OR UPDATE OF presencas, funcao ON public.mem_grupo_membros
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_grupo_auto_membro();

-- 3) Backfill de consistência: qualquer visitante ativo com >=1 presença que
--    tenha escapado (ex.: presença lançada antes desta migration).
UPDATE public.mem_grupo_membros
   SET funcao = 'frequentador'
 WHERE funcao = 'visitante'
   AND COALESCE(presencas, 0) >= 1
   AND saiu_em IS NULL
   AND deleted_at IS NULL;

COMMENT ON FUNCTION public.fn_grupo_auto_membro() IS
  'Regra (2026-07-23): visitante com >=1 presença vira frequentador. Novo entrante nasce visitante (default da coluna); vira frequentador na 1a presença confirmada.';
