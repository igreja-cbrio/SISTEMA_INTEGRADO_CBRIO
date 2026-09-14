-- ============================================================================
-- Decisões online FORA do formulário (chat, WhatsApp, ligação) · 14/09/2026
--
-- Contexto: desde 27/08 o modal do culto não manda `decisoes_online` no payload
-- e o campo virou somente-leitura — quem escreve é o trigger
-- `fn_cultos_dec_online_form_incrementa` (+1 a cada pessoa que preenche
-- cbrio.org/decisao). Marcos (14/09): "quero que fique desbloqueado para aumentar
-- esse número além dos que preencheram o formulário — os que decidiram no chat".
--
-- Desenho que preserva a contagem automática e evita a corrida do modal:
--   · `decisoes_online`        = TOTAL oficial (KPI ONL-13, dashboards, relatórios)
--                                = formulário (automático) + extra (manual)
--   · `decisoes_online_extra`  = parte MANUAL (chat e outros). É o único campo
--                                que a Integração edita.
--   · trigger BEFORE UPDATE: quando o extra muda, o total é recomposto por
--     DELTA (total_novo = total_atual − extra_antigo + extra_novo). Assim uma
--     decisão que entrou pelo formulário enquanto o modal estava aberto NÃO é
--     perdida ao salvar — o modal nunca envia o total.
-- ============================================================================

ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS decisoes_online_extra int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cultos.decisoes_online_extra IS
  'Decisões online registradas FORA do formulário do QR (chat ao vivo, WhatsApp, ligação). Lançado pela Integração. Já está SOMADO em decisoes_online (total oficial); nunca somar de novo.';

COMMENT ON COLUMN public.cultos.decisoes_online IS
  'TOTAL oficial de decisões online = pessoas que preencheram cbrio.org/decisao (trigger, +1 por linha form_publico) + decisoes_online_extra (manual: chat e outros, recomposto por trigger). Não editar direto pela UI.';

CREATE OR REPLACE FUNCTION public.fn_cultos_dec_online_extra_ajusta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.decisoes_online_extra IS DISTINCT FROM OLD.decisoes_online_extra THEN
    NEW.decisoes_online :=
      GREATEST(0,
        COALESCE(OLD.decisoes_online, 0)
        - COALESCE(OLD.decisoes_online_extra, 0)
        + COALESCE(NEW.decisoes_online_extra, 0));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cultos_dec_online_extra_ajusta ON public.cultos;
CREATE TRIGGER tg_cultos_dec_online_extra_ajusta
  BEFORE UPDATE OF decisoes_online_extra ON public.cultos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cultos_dec_online_extra_ajusta();

COMMENT ON FUNCTION public.fn_cultos_dec_online_extra_ajusta IS
  'Recompõe cultos.decisoes_online (total) por delta quando decisoes_online_extra (manual) muda. Convive com fn_cultos_dec_online_form_incrementa (+1 por formulário).';
