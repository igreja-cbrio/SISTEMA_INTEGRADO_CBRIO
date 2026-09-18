/**
 * Assinatura dos anexos de solicitação na LEITURA.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (auditoria de segurança · 16/08/2026)
 * O bucket `solicitacoes` era PÚBLICO: qualquer pessoa com a URL baixava a nota
 * fiscal, a foto do item ou o documento anexado — sem login. Ele foi fechado.
 *
 * O problema de fechar: a URL PÚBLICA está GRAVADA no banco
 * (`solicitacoes.imagens_url` jsonb, `documento_url`, `nota_fiscal_url`,
 * `solicitacao_itens.imagem_url`) e **o app do Staff continua gravando URL
 * pública no upload** (`CBRio-Staff/app/(app)/solicitacao/nova.tsx:104`), que é
 * binário na loja e não muda por deploy nosso.
 *
 * ⇒ A saída é NÃO reescrever o passado nem esperar release do app: o caminho é
 * DERIVADO da URL na leitura e assinado na hora. É o mesmo padrão que
 * `waInbox.pathDoBucketPublico` já usa desde 12/08.
 *
 * ⚠️ Assina em LOTE (`createSignedUrls`) — uma chamada por página de lista, não
 * uma por arquivo. Com N solicitações × M fotos, o ingênuo seria dezenas de
 * round-trips numa tela que abre o tempo todo.
 *
 * ⚠️ NUNCA grava nada. Se um dia alguém quiser migrar o dado para guardar o
 * caminho em vez da URL, isto continua funcionando (o helper é idempotente:
 * caminho cru entra e sai igual).
 */
const { supabase } = require('../utils/supabase');
const {
  caminhosDosCampos,
  aplicarAssinaturas,
} = require('../utils/storagePath');

const BUCKET = 'solicitacoes';

/** Campos da própria solicitação que podem apontar para o bucket. */
const CAMPOS_SOLICITACAO = ['imagens_url', 'documento_url', 'nota_fiscal_url'];
/** Campo do item de compra (foto por item). */
const CAMPOS_ITEM = ['imagem_url'];
/**
 * Campo da COTAÇÃO (o orçamento em PDF que o fornecedor mandou).
 * ⚠️ A coluna `solicitacao_cotacoes.anexo_url` existe e a API já a aceita desde
 * sempre — e ela NÃO era percorrida aqui. Enquanto ninguém anexava (0 de 19
 * cotações em 03/09/2026) o buraco ficou invisível; no primeiro orçamento
 * anexado, a URL pública gravada num bucket PRIVADO viraria link morto.
 */
const CAMPOS_COTACAO = ['anexo_url'];

// 1h: a lista é lida e a pessoa clica em seguida. Curto o bastante para um link
// vazado (print, encaminhamento) não virar acesso permanente — que é o problema
// que fechar o bucket resolve.
const VALIDADE_SEGUNDOS = 60 * 60;

/**
 * Recebe as linhas já enriquecidas e devolve uma cópia com os anexos do bucket
 * trocados por URL assinada.
 *
 * ⚠️ O que NÃO reconhece passa INTACTO: `ml_tracking_url` (rastreio do Mercado
 * Livre), link do SharePoint e qualquer URL de terceiro seguem como estão.
 */
async function assinarAnexosSolicitacoes(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return linhas;

  // 1) junta TODOS os caminhos da página, sem repetir
  const todos = new Set();
  for (const linha of linhas) {
    for (const p of caminhosDosCampos(linha, CAMPOS_SOLICITACAO, BUCKET)) todos.add(p);
    for (const item of (linha?.solicitacao_itens || [])) {
      for (const p of caminhosDosCampos(item, CAMPOS_ITEM, BUCKET)) todos.add(p);
    }
    for (const cot of (linha?.solicitacao_cotacoes || [])) {
      for (const p of caminhosDosCampos(cot, CAMPOS_COTACAO, BUCKET)) todos.add(p);
    }
  }
  if (todos.size === 0) return linhas;

  // 2) assina em lote
  const caminhos = [...todos];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(caminhos, VALIDADE_SEGUNDOS);

  // ⚠️ Falha da assinatura devolve as linhas ORIGINAIS, não linhas sem anexo:
  // "esta solicitação não tem foto" é uma afirmação diferente de "não consegui
  // gerar o link", e a primeira faz quem cota decidir sem ver a imagem.
  if (error) {
    console.warn('[anexosSolicitacao] createSignedUrls falhou:', error.message);
    return linhas;
  }

  // 3) mapa caminho → URL assinada.
  // ⚠️ O Storage devolve um item por caminho pedido, com `error` por item — o
  // arquivo pode ter sido apagado pela retenção. Item com erro fica FORA do
  // mapa, e `aplicarAssinaturas` deixa o valor original (que ao menos mostra
  // que existiu um anexo ali).
  const mapa = {};
  for (const item of (data || [])) {
    const p = item?.path;
    const url = item?.signedUrl || item?.signedURL; // o SDK já usou as duas grafias
    if (p && url && !item.error) mapa[p] = url;
  }
  if (Object.keys(mapa).length === 0) return linhas;

  // 4) aplica (sem mutar as linhas originais)
  return linhas.map((linha) => {
    const saida = aplicarAssinaturas(linha, CAMPOS_SOLICITACAO, BUCKET, mapa);
    if (Array.isArray(linha?.solicitacao_itens)) {
      saida.solicitacao_itens = linha.solicitacao_itens.map((item) =>
        aplicarAssinaturas(item, CAMPOS_ITEM, BUCKET, mapa)
      );
    }
    if (Array.isArray(linha?.solicitacao_cotacoes)) {
      saida.solicitacao_cotacoes = linha.solicitacao_cotacoes.map((cot) =>
        aplicarAssinaturas(cot, CAMPOS_COTACAO, BUCKET, mapa)
      );
    }
    return saida;
  });
}

module.exports = {
  BUCKET,
  CAMPOS_SOLICITACAO,
  CAMPOS_ITEM,
  CAMPOS_COTACAO,
  VALIDADE_SEGUNDOS,
  assinarAnexosSolicitacoes,
};
