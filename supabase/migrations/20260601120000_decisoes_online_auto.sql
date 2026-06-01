-- ============================================================================
-- Decisoes online · captura AUTOMATICA (Frente 2)
-- ============================================================================
-- Ate aqui, o unico campo de culto online ainda manual era cultos.decisoes_online
-- (lancado pela Integracao). O YouTube nao tem como dizer "fulano aceitou Jesus
-- online", entao precisamos de uma fonte de captura. Modelo aprovado:
--
--   * FORM PUBLICO (autoritativo) · cada pessoa que preenche o formulario
--     "Eu aceito Jesus" durante a live vira 1 linha em cultos_decisoes_pessoas
--     (tipo='online', fonte='form_publico') E incrementa cultos.decisoes_online
--     em +1 (este trigger). Sem dupla contagem · o form e o unico que mexe no
--     contador automaticamente; o contador continua sendo a verdade do KPI.
--   * CHAT (consultivo) · contagem de gatilhos no chat do YouTube vai pra
--     cultos.online_decisoes_chat · NAO soma no KPI (so dica pra Integracao).
--   * MANUAL (ajuste/piso) · a Integracao continua podendo ajustar
--     decisoes_online no modal; o cron de verificacao cobra se ficar vazio.
--
-- ADITIVA · nao muda comportamento de decisoes ja existentes (fonte='manual'
-- e o default · so o form publico dispara o incremento).
-- ============================================================================

-- 1. fonte da decisao (distingue form publico do lancamento manual)
ALTER TABLE public.cultos_decisoes_pessoas
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cultos_decisoes_pessoas_fonte_check'
  ) THEN
    ALTER TABLE public.cultos_decisoes_pessoas
      ADD CONSTRAINT cultos_decisoes_pessoas_fonte_check
      CHECK (fonte IN ('manual', 'form_publico', 'chat'));
  END IF;
END $$;

-- 2. contador consultivo de gatilhos detectados no chat do YouTube (nao-KPI)
--    + page token pra paginar o chat incrementalmente (so conta msg novas).
ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS online_decisoes_chat int,
  ADD COLUMN IF NOT EXISTS online_chat_page_token text;

COMMENT ON COLUMN public.cultos.online_decisoes_chat IS
  'Estimativa CONSULTIVA de decisoes detectadas no chat ao vivo do YouTube. NAO entra no KPI (decisoes_online e a fonte oficial). Serve de dica pra Integracao reconciliar.';

-- 3. Trigger · decisao online vinda do FORM PUBLICO incrementa decisoes_online.
--    So age quando tipo_decisao='online' AND fonte='form_publico' (lancamento
--    manual/kids/presencial nao mexe no contador · evita dupla contagem).
--    O UPDATE em cultos dispara cultos_recalc_kpis (realtime) automaticamente.
CREATE OR REPLACE FUNCTION public.fn_cultos_dec_online_form_incrementa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_decisao = 'online' AND NEW.fonte = 'form_publico' THEN
    UPDATE public.cultos
       SET decisoes_online = COALESCE(decisoes_online, 0) + 1
     WHERE id = NEW.culto_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cultos_dec_online_form_incrementa ON public.cultos_decisoes_pessoas;
CREATE TRIGGER tg_cultos_dec_online_form_incrementa
  AFTER INSERT ON public.cultos_decisoes_pessoas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cultos_dec_online_form_incrementa();
