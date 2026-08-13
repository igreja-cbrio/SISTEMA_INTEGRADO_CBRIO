-- Inbox v2: tempo real + anotações + coluna de mídia. Já aplicada via MCP.
-- Tempo real: novas mensagens/conversas aparecem sem recarregar.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_mensagens;
  EXCEPTION WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN CREATE PUBLICATION supabase_realtime FOR TABLE public.wa_mensagens;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversas;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.wa_conversas REPLICA IDENTITY FULL;  -- p/ UPDATE propagar payload
ALTER TABLE public.wa_mensagens REPLICA IDENTITY FULL;

-- Anotações internas por conversa + URL de mídia por mensagem (anexos).
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE public.wa_mensagens ADD COLUMN IF NOT EXISTS media_url text;
