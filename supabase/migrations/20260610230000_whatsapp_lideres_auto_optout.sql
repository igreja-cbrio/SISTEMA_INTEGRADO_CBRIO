-- ============================================================================
-- Bot WhatsApp · Grupos — auto-sync de líderes + opt-out de lembretes
-- (2026-06-10 · refinamentos do Marcos)
--
-- 1. origem ('manual' | 'auto'): vínculos criados automaticamente a partir de
--    mem_grupos.lider_id (nome+telefone do membro). O sync NUNCA mexe em
--    vínculo manual; só cria/atualiza/desativa os de origem 'auto'.
-- 2. recebe_lembretes: opt-out individual — "se o líder falar que não quer
--    mais receber, ele para" (o bot detecta o pedido na conversa e desliga;
--    o coordenador religa via PUT /api/whatsapp/lideres/:id).
--
-- Aditiva e idempotente.
-- ============================================================================

ALTER TABLE public.whatsapp_lideres
  ADD COLUMN IF NOT EXISTS recebe_lembretes boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_lideres
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE public.whatsapp_lideres
    ADD CONSTRAINT whatsapp_lideres_origem_check CHECK (origem IN ('manual', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.whatsapp_lideres.recebe_lembretes IS
  'false = líder pediu pra não receber lembretes/cobranças do bot (opt-out · responder ainda funciona)';
COMMENT ON COLUMN public.whatsapp_lideres.origem IS
  'manual (criado em /admin/whatsapp) · auto (sincronizado de mem_grupos.lider_id · o sync só gerencia estes)';

-- Conferência:
-- SELECT origem, count(*) FROM whatsapp_lideres WHERE deleted_at IS NULL GROUP BY origem;
-- ============================================================================
