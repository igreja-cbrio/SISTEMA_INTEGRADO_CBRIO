/**
 * Régua da FOTO da apresentação de crianças (16/09/2026).
 *
 * A família manda a foto ANTES de a inscrição existir: o formulário público
 * sobe o arquivo, recebe de volta um CAMINHO e manda esse caminho no envio.
 * Quer dizer que o caminho chega pela mão de quem preenche — e por isso ele é
 * VALIDADO no servidor antes de virar coluna.
 *
 * ⚠️⚠️ Sem essa guarda, qualquer um poderia mandar no formulário o caminho de
 * OUTRO arquivo do mesmo bucket privado (`foto-crianca/<id>.jpg`, a foto de
 * identificação de qualquer criança do Kids) e a ficha passaria a servir, por
 * URL assinada, um arquivo que não é daquela inscrição. O formato fechado
 * abaixo — prefixo + UUID v4 + extensão de imagem — é o que impede isso.
 */

const PREFIXO_FOTO = 'apresentacao-foto/';

// UUID v4 canônico, minúsculo. Nada de `.`, `/` ou `..` passa por aqui.
const RE_CAMINHO = /^apresentacao-foto\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Extensão do arquivo a partir do mime. `null` = tipo que não aceitamos. */
function extensaoDeMime(mime) {
  return MIME_EXT[String(mime || '').toLowerCase()] || null;
}

/**
 * O caminho veio no formato que ESTA porta gera?
 * @param {string} caminho
 * @returns {boolean}
 */
function caminhoFotoValido(caminho) {
  return typeof caminho === 'string' && RE_CAMINHO.test(caminho);
}

/**
 * Nome com que o arquivo chega no computador de quem baixa.
 *
 * ⚠️ Quem baixa está montando a passagem do culto: 14 arquivos chamados
 * `a3f9c1d2-....jpg` na pasta de Downloads não dizem de quem é nenhum. O nome
 * carrega a criança e a data.
 *
 * @param {string} nomeCrianca
 * @param {string|null} dataApresentacao  'YYYY-MM-DD'
 * @param {string} ext                    'jpg' | 'png' | 'webp'
 */
function nomeArquivoFoto(nomeCrianca, dataApresentacao, ext) {
  const base = String(nomeCrianca || 'crianca')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
    .replace(/[^A-Za-z0-9]+/g, '-')                      // só o que sobrevive em qualquer sistema
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'crianca';
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(dataApresentacao || '')) ? `_${dataApresentacao}` : '';
  return `${base}${data}.${ext || 'jpg'}`;
}

/** Extensão a partir do caminho guardado (pro nome do download). */
function extensaoDoCaminho(caminho) {
  const m = String(caminho || '').match(/\.(jpg|png|webp)$/);
  return m ? m[1] : 'jpg';
}

module.exports = {
  PREFIXO_FOTO,
  extensaoDeMime,
  caminhoFotoValido,
  nomeArquivoFoto,
  extensaoDoCaminho,
};
