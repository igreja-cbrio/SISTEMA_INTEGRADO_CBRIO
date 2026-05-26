-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Agent Queue · extensao pra agentes executores                         ║
-- ║                                                                       ║
-- ║ Auditores existentes (system/module_*/design) so RELATAM findings.   ║
-- ║ O executor financeiro · primeiro agente "ativo" · PROPOE acoes que   ║
-- ║ vao pra fila pra humano aprovar e aplicar.                            ║
-- ║                                                                       ║
-- ║ Novas colunas:                                                        ║
-- ║   action_label · titulo curto pra UI                                  ║
-- ║   reasoning    · explicacao do agente (porque propor essa acao)      ║
-- ║   applied_at   · quando a acao foi aplicada de verdade               ║
-- ║   apply_error  · mensagem de erro se apply falhou                    ║
-- ║                                                                       ║
-- ║ Status enum estendido com 'applied' (mantem 'executed' por          ║
-- ║ backward-compat · auditores legados continuam funcionando).          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.agent_queue
  ADD COLUMN IF NOT EXISTS action_label text,
  ADD COLUMN IF NOT EXISTS reasoning    text,
  ADD COLUMN IF NOT EXISTS applied_at   timestamptz,
  ADD COLUMN IF NOT EXISTS apply_error  text;

-- Recria CHECK constraint do status incluindo 'applied'.
-- Postgres nao aceita ALTER no CHECK in-place · drop + add.
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.agent_queue'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%IN%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_queue DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.agent_queue
  ADD CONSTRAINT agent_queue_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'applied', 'failed'));

-- Indices novos
CREATE INDEX IF NOT EXISTS idx_agent_queue_action_type
  ON public.agent_queue(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_queue_applied
  ON public.agent_queue(applied_at DESC)
  WHERE applied_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_queue_failed
  ON public.agent_queue(created_at DESC)
  WHERE status = 'failed';

COMMENT ON COLUMN public.agent_queue.action_label IS
  'Titulo curto da acao pra UI (ex: "Categorizar PIX R$ 50 de Maria Silva").';
COMMENT ON COLUMN public.agent_queue.reasoning IS
  'Explicacao do agente · porque essa acao faz sentido (visivel pro aprovador humano).';
COMMENT ON COLUMN public.agent_queue.applied_at IS
  'Timestamp de quando a acao foi de fato aplicada no banco (apos approve + handler ok).';
COMMENT ON COLUMN public.agent_queue.apply_error IS
  'Mensagem de erro se o handler de apply falhou · status fica failed.';

COMMIT;
