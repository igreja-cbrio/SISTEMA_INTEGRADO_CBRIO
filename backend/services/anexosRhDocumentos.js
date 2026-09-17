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
const { separarCaminhosPorBucket, aplicarAssinaturas } = require('../utils/storagePath');

const BUCKET_DOCS_RH = 'documentos-rh';
// ⚠️⚠️ BUCKET LEGADO. Até 09/2026 o documento pessoal ia para o `rh-fotos`
// PÚBLICO, com a URL pública gravada em `rh_documentos.storage_path`. Aquele
// bucket foi FECHADO (privado, sem policy nenhuma) e o arquivo NÃO foi movido:
// mover exigiria a service_role fora do servidor, e a régua de `storagePath`
// existe justamente para "derivar o caminho na LEITURA e assinar na hora", sem
// reescrever o passado.
//
// ⚠️ Enquanto houver linha de `rh_documentos` apontando para uma URL pública do
// `rh-fotos`, esta constante FICA. Removê-la transforma esses documentos em link
// morto — sem erro, sem log, só o anexo parando de abrir.
const BUCKET_DOCS_RH_LEGADO = 'rh-fotos';
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

  // ⚠️ Quem decide qual caminho é de qual bucket é a régua PURA do gate — a
  // decisão errada aqui produz link morto sem erro nenhum.
  const { atual, legado } = separarCaminhosPorBucket(
    linhas.map((l) => l?.storage_path), BUCKET_DOCS_RH, BUCKET_DOCS_RH_LEGADO,
  );
  if (!legado.length && !atual.length) return linhas;

  // ⚠️ Cada bucket falha SOZINHO: o `rh-fotos` fora do ar não pode apagar da
  // ficha os documentos que estão no bucket atual, e vice-versa.
  const [mapaAtual, mapaLegado] = await Promise.all([
    assinarNoBucket(BUCKET_DOCS_RH, atual),
    assinarNoBucket(BUCKET_DOCS_RH_LEGADO, legado),
  ]);

  if (!Object.keys(mapaAtual).length && !Object.keys(mapaLegado).length) return linhas;

  return linhas.map((l) => {
    const comLegado = aplicarAssinaturas(l, ['storage_path'], BUCKET_DOCS_RH_LEGADO, mapaLegado);
    // ⚠️ O legado vem PRIMEIRO: uma vez assinada, a URL deixa de casar com
    // `caminhoNoBucket` do bucket atual, então a 2ª passada não a toca.
    return aplicarAssinaturas(comLegado, ['storage_path'], BUCKET_DOCS_RH, mapaAtual);
  });
}

/**
 * Assina uma lista de caminhos num bucket. Devolve mapa `caminho -> url`.
 *
 * ⚠️ Falha devolve mapa VAZIO (que faz o valor ORIGINAL sobreviver) em vez de
 * sumir com o documento da ficha: "não consegui gerar o link" é afirmação
 * diferente de "este colaborador não tem RG anexado".
 */
async function assinarNoBucket(bucket, caminhos) {
  if (!caminhos.length) return {};
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrls(caminhos, DOCS_RH_TTL_SEG);
  if (error) {
    console.warn(`[anexosRhDocumentos] createSignedUrls falhou em ${bucket}:`, error.message);
    return {};
  }
  const mapa = {};
  for (const item of (data || [])) {
    const url = item?.signedUrl || item?.signedURL; // o SDK já usou as duas grafias
    if (item?.path && url && !item.error) mapa[item.path] = url;
  }
  return mapa;
}

module.exports = { BUCKET_DOCS_RH, BUCKET_DOCS_RH_LEGADO, DOCS_RH_TTL_SEG, assinarDocumentosRh };
