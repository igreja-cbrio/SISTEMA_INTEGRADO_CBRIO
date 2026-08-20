'use strict';

/**
 * Assinatura dos anexos do bucket `log-arquivos` na LEITURA.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE
 * `log-arquivos` é PÚBLICO e guarda **documento fiscal**: NF-e escaneada, DANFE
 * oficial (PDF da SEFAZ), comprovante de pagamento, nota de compra e anexo de
 * proposta. Qualquer pessoa com a URL baixa sem login — CNPJ, valores,
 * fornecedores e itens comprados pela igreja.
 *
 * Fechar o bucket quebraria toda leitura que hoje usa a URL pública. A saída é
 * a MESMA já usada em `anexosSolicitacao` (bucket `solicitacoes`, fechado em
 * 16/08): derivar o caminho na leitura e assinar na hora. `caminhoNoBucket` é
 * idempotente — aceita URL pública **e** caminho cru —, então o histórico misto
 * continua funcionando sem migrar uma linha sequer.
 *
 * ⚠️ Assina em LOTE (`createSignedUrls`): uma chamada por página, não uma por
 * arquivo.
 *
 * ⚠️ NUNCA grava nada.
 */
const { supabase } = require('../utils/supabase');
const { caminhoNoBucket, aplicarAssinaturas } = require('../utils/storagePath');

const BUCKET = 'log-arquivos';

// 1h: a lista é lida e a pessoa clica em seguida. Curto o bastante para um link
// vazado (print, encaminhamento) não virar acesso permanente — que é o problema
// que fechar o bucket resolve.
const VALIDADE_SEGUNDOS = 60 * 60;

/**
 * Assina uma lista de caminhos e devolve o mapa `caminho → URL assinada`.
 *
 * ⚠️ Item com erro fica FORA do mapa (o arquivo pode ter sido apagado), e quem
 * aplica deixa o valor original — que ao menos mostra que existiu um anexo ali.
 */
async function mapaAssinado(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrls(unicos, VALIDADE_SEGUNDOS);

  // ⚠️ Falha da assinatura NÃO vira "não tem anexo": "esta nota não tem PDF" é
  // afirmação diferente de "não consegui gerar o link", e a primeira faz quem
  // concilia decidir sem ver o documento.
  if (error) {
    console.warn('[anexosLogArquivos] createSignedUrls falhou:', error.message);
    return {};
  }

  const mapa = {};
  for (const item of (data || [])) {
    const p = item?.path;
    const url = item?.signedUrl || item?.signedURL; // o SDK já usou as duas grafias
    if (p && url && !item.error) mapa[p] = url;
  }
  return mapa;
}

/**
 * Troca, em cada linha, os `campos` que apontam para `log-arquivos` pela URL
 * assinada. Devolve cópias — não muta o que veio do banco.
 *
 * ⚠️ O que não reconhece passa INTACTO: link do SharePoint, URL de terceiro e
 * caminho de outro bucket seguem como estão.
 */
async function assinarLinhas(linhas, campos) {
  if (!Array.isArray(linhas) || !linhas.length) return linhas;

  const caminhos = [];
  for (const linha of linhas) {
    for (const campo of campos) {
      const p = caminhoNoBucket(linha?.[campo], BUCKET);
      if (p) caminhos.push(p);
    }
  }
  const mapa = await mapaAssinado(caminhos);
  if (!Object.keys(mapa).length) return linhas;

  return linhas.map((l) => aplicarAssinaturas(l, campos, BUCKET, mapa));
}

/**
 * Caso do `fin_transacoes.anexos_url`: jsonb com lista de OBJETOS
 * `{url, nome, tipo, em}` — `aplicarAssinaturas` cobre string e array de
 * string, não array de objeto, então o percurso é próprio.
 */
async function assinarAnexosDeObjetos(linhas, campo) {
  if (!Array.isArray(linhas) || !linhas.length) return linhas;

  const caminhos = [];
  for (const linha of linhas) {
    for (const anexo of (Array.isArray(linha?.[campo]) ? linha[campo] : [])) {
      const p = caminhoNoBucket(anexo?.url, BUCKET);
      if (p) caminhos.push(p);
    }
  }
  const mapa = await mapaAssinado(caminhos);
  if (!Object.keys(mapa).length) return linhas;

  return linhas.map((linha) => {
    if (!Array.isArray(linha?.[campo])) return linha;
    return {
      ...linha,
      [campo]: linha[campo].map((anexo) => {
        const p = caminhoNoBucket(anexo?.url, BUCKET);
        return (p && mapa[p]) ? { ...anexo, url: mapa[p] } : anexo;
      }),
    };
  });
}

module.exports = {
  BUCKET,
  VALIDADE_SEGUNDOS,
  mapaAssinado,
  assinarLinhas,
  assinarAnexosDeObjetos,
};
