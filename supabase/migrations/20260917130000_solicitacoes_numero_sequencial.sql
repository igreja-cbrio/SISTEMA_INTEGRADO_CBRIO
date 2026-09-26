-- Identificador sequencial humano para solicitacoes (ex.: "Solicitação #142").
-- NAO substitui o id (uuid, chave real) -- e so um numero de exibicao/comunicacao,
-- estavel e crescente, para facilitar referencia falada/escrita entre solicitante e aprovador.

CREATE SEQUENCE IF NOT EXISTS public.solicitacoes_numero_sequencial_seq;

ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS numero_sequencial INTEGER;

-- Backfill: atribui numeros em ordem cronologica de criacao (so quem ainda nao tem).
DO $$
DECLARE
  r RECORD;
  proximo INTEGER;
BEGIN
  FOR r IN
    SELECT id FROM public.solicitacoes
    WHERE numero_sequencial IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    proximo := nextval('public.solicitacoes_numero_sequencial_seq');
    UPDATE public.solicitacoes SET numero_sequencial = proximo WHERE id = r.id;
  END LOOP;
END $$;

-- A partir daqui, todo INSERT novo ganha o numero automaticamente.
ALTER TABLE public.solicitacoes
  ALTER COLUMN numero_sequencial SET DEFAULT nextval('public.solicitacoes_numero_sequencial_seq');

-- Sequence "pertence" a coluna (dropar a coluna dropa a sequence junto).
ALTER SEQUENCE public.solicitacoes_numero_sequencial_seq OWNED BY public.solicitacoes.numero_sequencial;

ALTER TABLE public.solicitacoes
  ALTER COLUMN numero_sequencial SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_solicitacoes_numero_sequencial
  ON public.solicitacoes (numero_sequencial);

COMMENT ON COLUMN public.solicitacoes.numero_sequencial IS
  'Numero sequencial humano (ex.: "Solicitacao #142"), atribuido automaticamente via sequence. NAO e a chave primaria -- so para exibicao/comunicacao.';
