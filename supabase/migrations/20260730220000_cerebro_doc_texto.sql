-- Cérebro · guardar o TEXTO do documento (hoje ele é descartado)
--
-- Problema que isto resolve: `cerebroProcessor.js` extrai o texto do arquivo do
-- SharePoint, manda pro Haiku resumir e JOGA FORA. No Postgres sobrevivem só
-- `resumo` (2-5 frases), `tags` e `nota_path`. Consequência: a busca do
-- assistente (`cerebroSearch.js`) só consegue procurar em TÍTULO e RESUMO — ela
-- sabe que existe uma "Ata da diretoria de março" e sabe o resumo dela, mas não
-- responde o que foi decidido lá, porque o corpo não está em lugar nenhum
-- consultável.
--
-- Decisão (conselho deliberativo de 30/07): guardar o documento INTEIRO, uma
-- linha por arquivo — NÃO fatiado em chunks. Motivo: a fronteira de permissão
-- (e de LGPD) é o documento. Chunk espalharia pedaços de ata pastoral por várias
-- linhas com o rótulo de permissão copiado em cada uma, e é assim que vaza.
-- Chunk só entra se a medição de recall provar necessidade.
--
-- ⚠️ NÃO indexa nada novo por conta própria: a permissão continua sendo a de
-- `cerebroSearch.canReadRouteKey`, que desde 30/07 é FAIL-CLOSED (biblioteca sem
-- módulo mapeado não aparece pra ninguém além de admin/diretor).

CREATE TABLE IF NOT EXISTS public.cerebro_doc_texto (
  -- PK = o próprio arquivo na fila. Reprocessar é UPSERT: idempotente por
  -- construção, sem linha órfã e sem precisar de rotina de limpeza.
  fila_id        uuid PRIMARY KEY REFERENCES public.cerebro_fila(id) ON DELETE CASCADE,
  biblioteca     text,
  nome_arquivo   text NOT NULL,
  nota_path      text,
  sharepoint_url text,
  -- Espelha `cerebro_fila.hash_arquivo`: permite re-extrair só o que mudou.
  hash_arquivo   text,
  conteudo       text NOT NULL,
  -- `f_unaccent` (migration 20260707130000) é obrigatório aqui: `extractTerms`
  -- do cerebroSearch já remove acento da pergunta, e o dicionário `portuguese`
  -- sozinho NÃO faz unaccent — sem isso "orçamento" nunca casaria com "orcamento".
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese', public.f_unaccent(coalesce(conteudo, '')))
  ) STORED,
  indexado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_doc_texto_tsv
  ON public.cerebro_doc_texto USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_cerebro_doc_texto_biblioteca
  ON public.cerebro_doc_texto (biblioteca);

ALTER TABLE public.cerebro_doc_texto ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'cerebro_doc_texto'
       AND policyname = 'cerebro_doc_texto_service'
  ) THEN
    CREATE POLICY cerebro_doc_texto_service ON public.cerebro_doc_texto
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- NENHUMA policy para `authenticated` — de propósito. Ver o COMMENT abaixo.
COMMENT ON TABLE public.cerebro_doc_texto IS
  'Texto integral extraído dos documentos do Cérebro (SharePoint). Derivado e '
  'reconstruível: a fonte de verdade continua sendo o arquivo no SharePoint.

   EXCEÇÕES às regras 2 e 4 do CLAUDE.md, justificadas (a regra exige justificar,
   não proíbe):
   · Sem policy `authenticated`: o filtro real é biblioteca→módulo em
     cerebroSearch.canReadRouteKey (JS, antes do LLM). Espelhar aquele mapa em
     RLS criaria uma SEGUNDA régua de permissão para manter em sincronia — e duas
     cópias divergentes da mesma regra é como uma delas fica para trás. Mesmo
     precedente de cerebro_fila. O frontend nunca lê esta tabela.
   · Sem `deleted_at`/whitelist de soft-delete: é cache reconstruível, não
     registro histórico. Apagar e reindexar é o comportamento certo; soft-delete
     só incharia o índice com texto morto. O CASCADE da fila já limpa.
   · Sem audit trigger: reprocessar o acervo geraria uma linha em app_audit_log
     por documento, sem responder nenhuma pergunta que o SharePoint já não
     responda (lá está o histórico de versões do arquivo).';

COMMENT ON COLUMN public.cerebro_doc_texto.conteudo IS
  'Texto extraído do arquivo. Pode conter PII (nome, salário, dado pastoral) — '
  'nunca logar, nunca devolver sem passar por canReadRouteKey.';
