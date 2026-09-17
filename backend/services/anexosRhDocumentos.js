/**
 * Assinatura dos documentos de RH na LEITURA.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE
 * O documento pessoal do colaborador (RG, CPF, CTPS, contrato, e agora os
 * anexos da ficha da contratada PJ) ia para o bucket PÚBLICO `rh-fotos`, com a
 * URL pública gravada em `rh_documentos.storage_path` — qualquer pessoa com o
 * link baixava sem login. A varredura RHP-01 (09/2026) apontou o upload do
 * módulo RH para o bucket PRIVADO `documentos-rh` e passou a assinar na
 * leitura; esta extração acabou o serviço, porque o **app do Staff continuava
 * escrevendo no bucket público** por um caminho próprio.
 *
 * ⚠️ A régua é UMA. Duas cópias divergiriam, e o sintoma seria o documento
 * abrindo no sistema e dando link morto no app (ou o contrário) — praticamente
 * indepurável para quem estivesse usando.
 *
 * ⚠️ `caminhoNoBucket` é idempotente e fail-closed: caminho relativo entra e
 * sai igual, URL pública ANTIGA do `rh-fotos` e link do SharePoint passam
 * INTACTOS. É isso que faz o histórico misto continuar funcionando sem
 * reescrever o passado.
 *
 * ⚠️ Assina em LOTE (`createSignedUrls`): uma chamada por página, não uma por
 * arquivo. A ficha da contratada prevê 5 anexos por pessoa — o ingênuo viraria
 * dezenas de round-trips numa tela que abre o tempo todo.
 */
const { supabase } = require('../utils/supabase');
const { caminhoNoBucket, aplicarAssinaturas } = require('../utils/storagePath');

const BUCKET_DOCS_RH = 'documentos-rh';
// 1h: a pessoa abre a ficha e clica em seguida. Curto o bastante para um link
// vazado (print, encaminhamento) não virar acesso permanente — que é exatamente
// o problema que fechar o bucket resolve.
const DOCS_RH_TTL_SEG = 60 * 60;

/**
 * Recebe linhas de `rh_documentos` e devolve uma cópia com `storage_path`
 * trocado por URL assinada. NUNCA grava nada.
 */
async function assinarDocumentosRh(linhas) {
  if (!Array.isArray(linhas) || !linhas.length) return linhas;

  const caminhos = [...new Set(
    linhas.map((l) => caminhoNoBucket(l?.storage_path, BUCKET_DOCS_RH)).filter(Boolean)
  )];
  if (!caminhos.length) return linhas;

  const { data, error } = await supabase.storage
    .from(BUCKET_DOCS_RH).createSignedUrls(caminhos, DOCS_RH_TTL_SEG);

  // ⚠️ Falha da assinatura devolve o valor ORIGINAL (que ao menos mostra que o
  // anexo existe) em vez de sumir com o documento da ficha. "Este colaborador
  // não tem RG anexado" é afirmação diferente de "não consegui gerar o link".
  if (error) {
    console.warn('[anexosRhDocumentos] createSignedUrls falhou:', error.message);
    return linhas;
  }

  const mapa = {};
  for (const item of (data || [])) {
    const url = item?.signedUrl || item?.signedURL; // o SDK já usou as duas grafias
    if (item?.path && url && !item.error) mapa[item.path] = url;
  }
  if (!Object.keys(mapa).length) return linhas;

  return linhas.map((l) => aplicarAssinaturas(l, ['storage_path'], BUCKET_DOCS_RH, mapa));
}

module.exports = { BUCKET_DOCS_RH, DOCS_RH_TTL_SEG, assinarDocumentosRh };
