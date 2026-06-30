-- Pergunta "Você já fez o NEXT?" no formulário público de inscrição de batismo.
-- Coluna dedicada (boolean · NULL = não informado) pra permitir cruzamento
-- Next × batismo. Aditiva e idempotente.

ALTER TABLE public.batismo_inscricoes
  ADD COLUMN IF NOT EXISTS fez_next boolean;

COMMENT ON COLUMN public.batismo_inscricoes.fez_next IS
  'Se o inscrito declarou ter feito o NEXT (form público de batismo). NULL = não informado. 2026-06-30.';
