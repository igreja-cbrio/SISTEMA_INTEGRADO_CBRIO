-- ============================================================================
-- Kids · uma criança tem só UMA mãe e UM pai (trava no banco)
-- ============================================================================
-- Pedido do Matheus (2026-07-10): cada criança pode ter no máximo 1 responsável
-- com parentesco 'mae' e 1 com 'pai'. Os demais parentescos ('pai'/'mae' são os
-- únicos travados; 'outro', 'responsavel', avós, tios, etc. podem ser vários).
--
-- A trava é um trigger BEFORE INSERT OR UPDATE — cobre TODAS as origens de
-- escrita (totem, app via aprovação de vínculo, importações). NÃO usamos índice
-- UNIQUE de propósito: os dados atuais ainda têm duplicatas de import antigo e o
-- índice falharia na criação. O trigger só vale pra escritas NOVAS, que é o
-- objetivo — as duplicatas legadas seguem sendo limpas à parte.
--
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_kids_um_pai_uma_mae()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_existe integer;
BEGIN
  -- Só regula 'mae' e 'pai'. Demais parentescos podem ter vários.
  IF NEW.parentesco IN ('mae', 'pai') THEN
    SELECT 1 INTO v_existe
    FROM public.kids_responsaveis kr
    WHERE kr.crianca_id = NEW.crianca_id
      AND kr.parentesco = NEW.parentesco
      AND kr.membro_id IS DISTINCT FROM NEW.membro_id   -- outra pessoa
      AND kr.id IS DISTINCT FROM NEW.id                 -- outra linha
    LIMIT 1;

    IF v_existe IS NOT NULL THEN
      IF NEW.parentesco = 'mae' THEN
        RAISE EXCEPTION 'Esta criança já tem uma mãe cadastrada. Cada criança tem só uma mãe e um pai.'
          USING ERRCODE = '23505';
      ELSE
        RAISE EXCEPTION 'Esta criança já tem um pai cadastrado. Cada criança tem só uma mãe e um pai.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_kids_um_pai_uma_mae() IS
  'Trava: cada criança tem no máximo 1 responsável mae e 1 pai (2026-07-10). Não bloqueia outros parentescos.';

DROP TRIGGER IF EXISTS trg_kids_um_pai_uma_mae ON public.kids_responsaveis;
CREATE TRIGGER trg_kids_um_pai_uma_mae
BEFORE INSERT OR UPDATE ON public.kids_responsaveis
FOR EACH ROW EXECUTE FUNCTION public.fn_kids_um_pai_uma_mae();
