-- ============================================================================
-- Grupos · regra automática: visitante que comparece MAIS DE 3 vezes vira
-- membro (funcao 'visitante' → 'frequentador'). Pedido do Marcos (2026-06-20):
-- "visitantes são os que foram uma vez ou outra; foi mais de 3 vezes, vira
--  membro automático."
--
-- mem_grupo_membros.presencas é um contador (incrementado pela RPC
-- incrementar_presenca_grupo e no registro de encontro). O trigger reage à
-- mudança de presencas/funcao e promove na hora. Só mexe em quem está como
-- 'visitante' — membros/líderes/supervisores não são tocados.
-- Aditiva e idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_grupo_auto_membro()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.funcao = 'visitante' AND COALESCE(NEW.presencas, 0) > 3 THEN
    NEW.funcao := 'frequentador';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_grupo_auto_membro ON public.mem_grupo_membros;
CREATE TRIGGER tg_grupo_auto_membro
  BEFORE INSERT OR UPDATE OF presencas, funcao ON public.mem_grupo_membros
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_grupo_auto_membro();

-- Backfill: aplica a regra ao que já existe (hoje ninguém é 'visitante', mas
-- mantém consistência caso existam visitantes com >3 presenças).
UPDATE public.mem_grupo_membros
   SET funcao = 'frequentador'
 WHERE funcao = 'visitante'
   AND COALESCE(presencas, 0) > 3;

COMMENT ON FUNCTION public.fn_grupo_auto_membro() IS
  'Regra: visitante com >3 presenças vira frequentador (membro) automaticamente.';
