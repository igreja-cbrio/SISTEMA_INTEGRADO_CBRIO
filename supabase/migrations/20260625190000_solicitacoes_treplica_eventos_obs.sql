-- ============================================================================
-- Solicitacoes · "Relatar Problema" round-trip: treplica + comentario no historico
-- ============================================================================
-- Decidido com Marcos (oficializacao do modulo · fechamento do ciclo de devolucao):
--   Fluxo: Solicitante -> Diretor da Area -> Area Solicitada
--          -> (se houver problema) Area RELATA -> volta pro Solicitante
--          -> Solicitante AJUSTA + RESPONDE (treplica) -> volta pra Area
--          -> Area da APROVACAO ou REJEICAO definitiva (Aprovar mantem 2 passos:
--             depois Concluir; Rejeitar e terminal · sem Concluir).
--
--   1) A "treplica" do solicitante (resposta ao ajuste pedido) passa a ser
--      registrada na linha do tempo. Hoje o `solicitacao_ajustes.motivo` so
--      aceitava descricao/escopo/data/cancelamento → liberar 'resposta'.
--   2) O comentario final da area (opcional, ao Aprovar/Rejeitar/Concluir) passa
--      a FICAR NO HISTORICO. Hoje o gatilho de eventos registra a transicao de
--      status mas NAO copia a observacao da decisao (a coluna `observacao` de
--      solicitacoes_eventos existia mas nunca era preenchida). Passa a copiar
--      `NEW.observacoes` SO quando a observacao mudou nesta mesma atualizacao
--      (evita re-logar uma observacao antiga numa transicao posterior).
--
-- Idempotente. Atomica. Nao-destrutiva.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Liberar o motivo 'resposta' (treplica do solicitante) no log de ajustes
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacao_ajustes
  DROP CONSTRAINT IF EXISTS solicitacao_ajustes_motivo_check;

ALTER TABLE public.solicitacao_ajustes
  ADD CONSTRAINT solicitacao_ajustes_motivo_check
  CHECK (motivo IN ('descricao', 'escopo', 'data', 'cancelamento', 'resposta'));

COMMENT ON COLUMN public.solicitacao_ajustes.motivo IS
  'descricao/escopo/data = problema relatado (devolucao do responsavel OU alteracao do solicitante) · cancelamento = encerra · resposta = treplica do solicitante ao reenviar. 2026-06-25.';

-- ----------------------------------------------------------------------------
-- 2. Gatilho de eventos passa a gravar a observacao da decisao no historico
-- ----------------------------------------------------------------------------
-- So o corpo da funcao muda (acrescenta a coluna observacao no INSERT do UPDATE,
-- condicionada a observacao ter mudado nesta atualizacao). Os triggers
-- (AFTER INSERT / BEFORE UPDATE) continuam os mesmos · nao precisam ser recriados.
CREATE OR REPLACE FUNCTION public.tg_solicitacoes_log_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.solicitacoes_eventos (solicitacao_id, status_anterior, status_novo, ator_id)
    VALUES (NEW.id, NULL, NEW.status, NEW.solicitante_id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.solicitacoes_eventos (solicitacao_id, status_anterior, status_novo, ator_id, observacao)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.responsavel_id,
            CASE WHEN NEW.observacoes IS DISTINCT FROM OLD.observacoes
                 THEN NEW.observacoes ELSE NULL END);

    -- Auto-preenche respondido_em quando passa pra em_analise/em_atendimento/aprovado/aguardando_entrega
    IF NEW.respondido_em IS NULL AND NEW.status IN ('em_analise', 'em_atendimento', 'aprovado', 'aguardando_entrega') THEN
      NEW.respondido_em := now();
    END IF;
    -- Auto-preenche concluido_em quando passa pra concluido
    IF NEW.concluido_em IS NULL AND NEW.status = 'concluido' THEN
      NEW.concluido_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
