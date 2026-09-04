-- ════════════════════════════════════════════════════════════════════════════
--  Bucket `solicitacoes` · fecha DELETE/UPDATE e põe teto de tamanho
--  (03/09/2026 · achado ao ligar o anexo em PDF nas solicitações)
--
-- ⚠️⚠️ O QUE ESTAVA ABERTO, medido em produção antes de escrever:
--   INSERT  authenticated  bucket_id = 'solicitacoes'
--   UPDATE  authenticated  bucket_id = 'solicitacoes'   ← qualquer um sobrescreve
--   DELETE  authenticated  bucket_id = 'solicitacoes'   ← qualquer um apaga
--
-- Ou seja: QUALQUER conta autenticada podia apagar ou SOBRESCREVER qualquer
-- arquivo do bucket inteiro. E o auth do Supabase é COMPARTILHADO entre o app
-- de membros e o ERP — não é a equipe administrativa, é toda a base de logins.
-- Num fluxo que aprova dinheiro, trocar o PDF de um orçamento por outro é
-- fraude com uma chamada de `supabase.storage.update`.
--
-- ⚠️ Isto RESTRINGE, nunca amplia. Conferido antes: NENHUM cliente usa
-- remove/update neste bucket — nem o ERP (`src/`), nem o app do Staff, nem o
-- backend (que fala por service_role e é imune a policy). Varredura:
--   grep "from('solicitacoes')" em src, CBRio-Staff/app e backend → 0 ocorrências
--   de .remove(/.update(/.move(/.copy(.
--
-- ⚠️ O INSERT FICA como está: é ele que o intake usa (upload direto do cliente
-- com a chave anon autenticada), no ERP e no app da loja. Mexer nele quebraria
-- o envio de anexo de um binário que não muda por deploy nosso.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists "solicitacoes anexos delete autenticado" on storage.objects;
drop policy if exists "solicitacoes anexos update autenticado" on storage.objects;

-- ⚠️⚠️ TETO DE TAMANHO no bucket, que estava `null` (= sem limite).
-- O upload sai DIRETO do cliente, então o `accept=".pdf,..."` da tela é
-- cosmético: dá pra subir qualquer coisa, de qualquer tamanho, autenticado.
-- O cliente valida 10 MB com mensagem amigável ANTES de subir o primeiro byte
-- (`src/lib/anexoSolicitacao.js`); estes 15 MB são a REDE DE SEGURANÇA — e é a
-- única régua que o app da loja respeita sem precisar de release.
update storage.buckets
   set file_size_limit = 15728640  -- 15 MB
 where id = 'solicitacoes';

-- ⚠️ `allowed_mime_types` fica NULL DE PROPÓSITO. O app do Staff manda o
-- `contentType` que o picker do sistema operacional devolve (no iOS um HEIC
-- vira `image/heic`), e uma allowlist incompleta mataria o upload de um
-- binário que não conseguimos corrigir por deploy. Fechar a lista de mimes é
-- decisão para quando houver release do app conferindo o que ele manda.
