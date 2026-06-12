-- Habilita Supabase Realtime na tabela `notificacoes` para que o sino do
-- AppShell receba INSERTs por WebSocket no instante em que o backend
-- (`notificar()`) grava a linha · elimina a janela de ate 10s do polling
-- e remove a necessidade de recarregar a pagina pra ver alertas novos
-- (ex: novas inscricoes de batismo).

-- Idempotente · re-executar a migration nao quebra se a tabela ja
-- estiver na publication.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      -- Em projetos novos a publication pode nao existir ainda · cria
      -- e adiciona a tabela.
      CREATE PUBLICATION supabase_realtime FOR TABLE public.notificacoes;
  END;
END $$;

-- REPLICA IDENTITY FULL garante que UPDATEs (ex: marcar como lida) tambem
-- propaguem o payload completo no Realtime, caso queiramos assinar isso no futuro.
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
