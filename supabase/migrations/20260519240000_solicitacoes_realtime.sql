-- ============================================================================
-- Solicitacoes · habilita Supabase Realtime
--
-- Marcos (19/05 14:55): "chegou uma solicitacao para mim, mas ela nao
-- atualizou no kanban instanteamente, preciso que seja instataneo."
--
-- O kanban de /solicitacoes faz fetch unico no mount via api.list() e nao
-- tem polling · novas solicitacoes (ou mudancas de status) so apareciam
-- apos reload manual da pagina.
--
-- Esta migration habilita Realtime na tabela `solicitacoes`. O frontend
-- (Solicitacoes.jsx) assina o canal `postgres_changes` event='*' e chama
-- load() debounced em 400ms a cada evento.
-- ============================================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      CREATE PUBLICATION supabase_realtime FOR TABLE public.solicitacoes;
  END;
END $$;

-- REPLICA IDENTITY FULL pra UPDATEs propagarem payload completo
-- (necessario quando o frontend quiser ler campos alterados sem refetch
-- · hoje a gente so usa o evento como gatilho de reload).
ALTER TABLE public.solicitacoes REPLICA IDENTITY FULL;
