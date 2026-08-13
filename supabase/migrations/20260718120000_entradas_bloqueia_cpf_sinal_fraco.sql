-- ============================================================================
-- Entradas · encerra novas pendências de CPF baseadas em sinal fraco
--
-- Decisão de produto (Marcos · 2026-07-18): os 254 registros existentes serão
-- resolvidos manualmente, mas telefone, e-mail, Wi-Fi ou outro sinal fraco não
-- devem mais criar trabalho humano para confirmar CPF.
--
-- O CPF continua preservado na tabela que o recebeu. Ele só entra na identidade
-- global quando uma fonte forte confirmar a pessoa. Conflitos concretos
-- (cpf_conflito, cpf_divergente e vinculo_divergente) continuam normalmente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_identidade_bloquear_cpf_sinal_fraco()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- cpf_para_confirmar significa, por definição, que não houve evidência forte
  -- suficiente. A informação permanece na origem; não vira nova pendência.
  IF NEW.tipo = 'cpf_para_confirmar' THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_identidade_bloquear_cpf_sinal_fraco
  ON public.identidade_pendencias;

CREATE TRIGGER trg_identidade_bloquear_cpf_sinal_fraco
BEFORE INSERT ON public.identidade_pendencias
FOR EACH ROW
EXECUTE FUNCTION public.fn_identidade_bloquear_cpf_sinal_fraco();

COMMENT ON FUNCTION public.fn_identidade_bloquear_cpf_sinal_fraco() IS
  'Impede novas pendências cpf_para_confirmar originadas por sinais fracos. Não altera a fila legada nem bloqueia conflitos concretos de CPF/vínculo.';

COMMENT ON TRIGGER trg_identidade_bloquear_cpf_sinal_fraco
  ON public.identidade_pendencias IS
  'Guarda central: novas evidências fracas ficam na fonte e não alimentam a fila Entradas.';
