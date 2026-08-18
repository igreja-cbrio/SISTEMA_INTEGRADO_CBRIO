-- Grupos · terceiro desfecho do líder: "não consegui contato" (Naná · 17/08/2026)
--
-- Até aqui o líder só tinha DUAS saídas no link /g/a/: aprovar ou recusar. Mas
-- o fluxo que a casa adotou em 29/07 manda ele LIGAR pra pessoa antes de
-- decidir — e quando a pessoa não atende, nenhuma das duas serve: recusar diz
-- "não quero essa pessoa no meu grupo", que não é verdade, e deixar pendente
-- não conta pra ninguém que houve tentativa.
--
-- Pedido da Naná: "ter também a opção de 'não respondeu', pois aí temos as
-- pessoas que aceitaram, que recusaram e que não conseguiram contato".
--
-- ⚠️ Por que STATUS e não coluna/evento: ela quer VER a categoria (contagem e
-- filtro na Caixa de entrada). Status dá isso de graça — chip, badge e as
-- estatísticas do "Retrato do período" derivam do status. Evento serviria pra
-- auditar, não pra filtrar; coluna paralela criaria duas verdades sobre o
-- desfecho do mesmo pedido.
--
-- ⚠️ ADITIVO: só acrescenta um valor ao CHECK. Nenhuma linha existente muda de
-- status, e a lista é DERIVADA da constraint viva (não decorada) pra não
-- estreitar em silêncio caso prod tenha algum valor que o repo não conheça —
-- lição do CHECK de app_inscricoes (06/08).

DO $$
DECLARE
  nome_check text;
  def_atual  text;
  valores    text;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO nome_check, def_atual
    FROM pg_constraint c
   WHERE c.conrelid = 'public.mem_grupo_pedidos'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%status%'
   LIMIT 1;

  IF nome_check IS NULL THEN
    RAISE EXCEPTION 'CHECK de status de mem_grupo_pedidos não encontrado — abortando (não vou criar um do zero e estreitar valores que existem em prod)';
  END IF;

  IF def_atual ILIKE '%sem_contato%' THEN
    RAISE NOTICE 'sem_contato já está no CHECK (%) — nada a fazer', nome_check;
    RETURN;
  END IF;

  -- Extrai a lista atual de dentro do CHECK e acrescenta o valor novo.
  valores := substring(def_atual from 'ARRAY\[(.*)\]');
  IF valores IS NULL THEN
    valores := substring(def_atual from 'IN \((.*?)\)');
  END IF;
  IF valores IS NULL THEN
    RAISE EXCEPTION 'não consegui ler os valores do CHECK atual: %', def_atual;
  END IF;
  -- tira os ::text que o Postgres imprime
  valores := replace(valores, '::text', '');

  EXECUTE format('ALTER TABLE public.mem_grupo_pedidos DROP CONSTRAINT %I', nome_check);
  EXECUTE format(
    'ALTER TABLE public.mem_grupo_pedidos ADD CONSTRAINT %I CHECK (status IN (%s, ''sem_contato''))',
    nome_check, valores
  );
  RAISE NOTICE 'CHECK % recriado com sem_contato. Valores antes: %', nome_check, valores;
END $$;

COMMENT ON COLUMN public.mem_grupo_pedidos.status IS
  'pendente | aprovado | rejeitado | devolvido | encaminhado | cancelado | sem_contato. '
  '"devolvido" = o líder RECUSOU e a triagem assume. "sem_contato" = o líder TENTOU '
  'e não conseguiu falar com a pessoa (Naná · 17/08/2026) — não é recusa, e a triagem '
  'assume o contato por outro canal. Os dois vão pra fila da triagem; o que muda é o '
  'que aconteceu, e é isso que a coordenação precisa distinguir.';

-- Conferência (rodar depois; o SQL Editor do Supabase não mostra RAISE NOTICE):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.mem_grupo_pedidos'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%status%';
--   -- deve listar sem_contato junto dos demais
