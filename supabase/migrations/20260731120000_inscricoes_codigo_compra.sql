-- Código legível da inscrição (CBR-AAAA-NNNNNN) · 2026-07-31
--
-- Pedido do Marcos: "toda compra feita" precisa de um ID único que a pessoa
-- possa citar (e-mail, telefone, portaria). O uuid da inscrição não serve pra
-- isso — ninguém dita 36 caracteres hexadecimais.
--
-- ⚠️ O código é IDENTIFICADOR, NÃO CREDENCIAL. Ele é sequencial e portanto
-- adivinhável: quem souber um código sabe o próximo. O acesso continua onde
-- sempre esteve — comprovante no token HMAC (services/inscricaoComprovante.js)
-- e cobrança no `pag_cobrancas.public_token`. NUNCA aceitar este código como
-- prova de identidade nem como chave de consulta pública.
--
-- Decisão de escopo (Marcos, 31/07): TODA inscrição recebe código — gratuita,
-- paga e com bolsa integral. Bolsa integral continua sendo uma inscrição, e o
-- atendimento precisa poder perguntar "qual seu número?" sem exceção.

-- Contador por ano. É TABELA e não SEQUENCE de propósito: sequence não
-- reinicia sozinha na virada do ano, e `setval` manual na virada é exatamente o
-- tipo de passo que ninguém lembra de dar. O UPSERT ... RETURNING abaixo é
-- atômico, então duas inscrições simultâneas no minuto do lançamento nunca
-- pegam o mesmo número.
CREATE TABLE IF NOT EXISTS public.insc_codigo_contador (
  ano            INTEGER PRIMARY KEY,
  ultimo         INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.insc_codigo_contador IS
  'Contador do código de inscrição, um por ano. Catálogo interno de numeração — não tem PII e não é lido pelo client.';

ALTER TABLE public.insc_codigo_contador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insc_codigo_contador_service ON public.insc_codigo_contador;
CREATE POLICY insc_codigo_contador_service ON public.insc_codigo_contador
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS insc_codigo_contador_super ON public.insc_codigo_contador;
CREATE POLICY insc_codigo_contador_super ON public.insc_codigo_contador
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- A coluna. Nullable + UNIQUE (NULL não conflita com NULL no Postgres), então o
-- backfill pode rodar em lotes sem travar nada.
ALTER TABLE public.inscricoes ADD COLUMN IF NOT EXISTS codigo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.inscricoes'::regclass AND conname = 'inscricoes_codigo_key'
  ) THEN
    ALTER TABLE public.inscricoes ADD CONSTRAINT inscricoes_codigo_key UNIQUE (codigo);
  END IF;
END $$;

COMMENT ON COLUMN public.inscricoes.codigo IS
  'Código legível da inscrição (CBR-AAAA-NNNNNN). IDENTIFICADOR público pra pessoa citar — NÃO é credencial (é sequencial/adivinhável). Acesso ao comprovante segue no token HMAC; à cobrança, no public_token. Pode ter buraco na sequência (rollback de transação consome número), então NÃO usar como contagem de volume em relatório.';

-- Gerador. SECURITY DEFINER porque o contador é fechado pro client, e a função
-- é chamada de dentro do trigger que roda no INSERT de quem tem permissão de
-- inscrever.
CREATE OR REPLACE FUNCTION public.fn_insc_proximo_codigo(p_ano INTEGER DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano INTEGER;
  v_n   INTEGER;
BEGIN
  -- Ano em BRT, não em UTC: inscrição feita 31/12 às 22h no Rio é do ano que
  -- está terminando, não do seguinte.
  v_ano := COALESCE(
    p_ano,
    EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER
  );

  INSERT INTO public.insc_codigo_contador (ano, ultimo)
       VALUES (v_ano, 1)
  ON CONFLICT (ano) DO UPDATE
       SET ultimo = public.insc_codigo_contador.ultimo + 1,
           atualizado_em = now()
  RETURNING ultimo INTO v_n;

  RETURN 'CBR-' || v_ano::TEXT || '-' || lpad(v_n::TEXT, 6, '0');
END
$$;

-- Trigger e não código de aplicação: `inscricoes` tem mais de um escritor
-- (porta pública, painel, script de migração do Celebra) e o código não pode
-- depender de cada um lembrar de preencher. Mesma lógica do contrato de porta.
CREATE OR REPLACE FUNCTION public.tg_inscricoes_codigo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    NEW.codigo := public.fn_insc_proximo_codigo(
      EXTRACT(YEAR FROM (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo'))::INTEGER
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_inscricoes_codigo ON public.inscricoes;
CREATE TRIGGER trg_inscricoes_codigo
  BEFORE INSERT ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_inscricoes_codigo();

-- Backfill de TODA inscrição existente, em ordem cronológica e por ano —
-- inclusive as migradas do Celebra (legado_fonte) e as soft-deletadas, pra que
-- consulta de histórico e conferência de lista antiga também tenham número.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id,
           EXTRACT(YEAR FROM (created_at AT TIME ZONE 'America/Sao_Paulo'))::INTEGER AS ano
      FROM public.inscricoes
     WHERE codigo IS NULL
     ORDER BY created_at, id
  LOOP
    UPDATE public.inscricoes
       SET codigo = public.fn_insc_proximo_codigo(r.ano)
     WHERE id = r.id;
  END LOOP;
END $$;

-- Busca por código no painel (o operador digita o número que a pessoa ditou).
CREATE INDEX IF NOT EXISTS idx_inscricoes_codigo
  ON public.inscricoes (codigo) WHERE deleted_at IS NULL;
