-- ============================================================================
-- Banco de Comprovantes · a RPC para de montar URL PÚBLICA por dentro
-- Parte do fechamento do bucket `log-arquivos` (documento fiscal) · 19/08/2026
-- ============================================================================
-- O QUE ESTAVA ERRADO
--   `fn_banco_comprovantes` devolvia, no ramo das notas fiscais:
--       p_base || '/storage/v1/object/public/log-arquivos/' || n.storage_path
--
--   Isso amarra a leitura ao bucket ser PÚBLICO — e `log-arquivos` guarda NF-e
--   escaneada, DANFE oficial da SEFAZ, comprovante de pagamento e nota de
--   compra. Qualquer pessoa com a URL baixa sem login.
--
-- ⚠️⚠️ E JÁ ESTAVA INCONSISTENTE, independente de privacidade: a coluna
--   `log_notas_fiscais.storage_path` carrega DOIS formatos —
--     · caminho cru      (`notas-fiscais/<chave>/danfe.pdf`, do importador de DANFE)
--     · URL pública completa (do `POST /notas/escanear`)
--   Concatenar a base na frente do segundo produz URL DOBRADA
--   (`.../public/log-arquivos/https://.../public/log-arquivos/...`), que não
--   abre. Um dos dois caminhos estava quebrado o tempo todo, e em silêncio.
--
-- A CORREÇÃO
--   A RPC passa a devolver o valor CRU da coluna. Quem transforma em link é o
--   backend (`services/anexosLogArquivos`), que assina por 1h e — usando
--   `utils/storagePath.caminhoNoBucket`, que é idempotente — aceita os dois
--   formatos sem precisar migrar uma linha sequer.
--
-- ⚠️ `p_base` FICA na assinatura, de propósito: removê-lo criaria OVERLOAD
--   (a versão antiga continuaria viva e o PostgREST poderia escolher qualquer
--   uma). O parâmetro passa a ser ignorado; o backend segue mandando.
--
-- ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA, nunca `CREATE OR REPLACE` com o
--   corpo do arquivo do repo: a definição em produção pode ter sido ajustada
--   fora do git, e recolar o arquivo reverteria esse ajuste em silêncio (a
--   lição do `handle_new_user` e do `fn_app_inscricoes_fanout`).
-- ============================================================================

DO $$
DECLARE
  v_def   text;
  v_nova  text;
  v_ocorr int;
  v_alvo  constant text :=
    'p_base||''/storage/v1/object/public/log-arquivos/''||n.storage_path';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_banco_comprovantes'
     AND pg_get_function_identity_arguments(p.oid)
         = 'p_inicio date, p_fim date, p_conta uuid, p_q text, p_base text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fn_banco_comprovantes(date,date,uuid,text,text) não encontrada — a assinatura mudou; conferir antes de patchar';
  END IF;

  -- Idempotência: já patchada? (não monta mais URL pública)
  IF position('storage/v1/object/public/log-arquivos' in v_def) = 0 THEN
    RAISE NOTICE 'fn_banco_comprovantes já devolve o caminho cru — nada a fazer';
    RETURN;
  END IF;

  -- ⚠️ Conta as ocorrências ANTES de substituir. Se não for exatamente 1, a
  -- forma viva não é a que este patch conhece — abortar é melhor que reescrever
  -- às cegas uma função que serve o Financeiro.
  v_ocorr := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  IF v_ocorr <> 1 THEN
    RAISE EXCEPTION 'esperava 1 ocorrência da montagem de URL, encontrei % — a definição viva divergiu', v_ocorr;
  END IF;

  v_nova := replace(v_def, v_alvo, 'n.storage_path');
  EXECUTE v_nova;

  RAISE NOTICE 'fn_banco_comprovantes: passa a devolver o caminho cru (o backend assina)';
END $$;

COMMENT ON FUNCTION public.fn_banco_comprovantes(date, date, uuid, text, text) IS
  'Banco de comprovantes do Financeiro (anexos de transação + notas com arquivo). '
  '⚠️ Devolve o valor CRU de `url`/`storage_path` — caminho no bucket `log-arquivos` '
  'ou, no histórico, a URL pública. NÃO montar URL aqui: o bucket guarda documento '
  'fiscal e é privado; quem assina é backend/services/anexosLogArquivos, por 1h. '
  '`p_base` é IGNORADO e só continua na assinatura para não criar overload.';
