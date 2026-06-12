-- Estende CHECK constraint pra aceitar 'decidido' como sinonimo de aprovado.
-- Rotas /fila-classificacao/aprovar-massa e /fila-classificacao/:id/decidir
-- usavam 'decidido' que nao estava no CHECK · daa erro 500.
-- Aprovacao individual (financeiroV2.fila.aprovar) usa 'aprovado' · ja era valido.

ALTER TABLE public.fin_fila_classificacao
  DROP CONSTRAINT IF EXISTS fin_fila_classificacao_status_check;

ALTER TABLE public.fin_fila_classificacao
  ADD CONSTRAINT fin_fila_classificacao_status_check
  CHECK (status IN ('pendente', 'aprovado', 'decidido', 'editado', 'ignorado'));
