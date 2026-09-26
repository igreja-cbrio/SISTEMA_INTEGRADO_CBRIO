// Vídeo do item do devocional (25/09/2026 · pedido do Marcos: "subir vídeos nas
// devocionais"). Régua PURA — `npm run test:devocional-video`.
//
// ⚠️ O arquivo NÃO passa pela API: o Vercel corta o corpo da requisição em
// ~4,5 MB, e vídeo tem centenas. A API só emite um link ASSINADO de upload
// (service role) e o navegador sobe direto pro Storage. Depois a API grava o
// caminho no item — e é por isso que o caminho tem que provar que é DESTE item.
//
// ⚠️ Formatos: mp4 (H.264) toca em tudo. `.mov` do iPhone costuma ser HEVC e
// pode NÃO tocar no Android — aceito, mas a tela avisa pra preferir mp4.

const BUCKET = 'devocional-videos';
const LIMITE_BYTES = 500 * 1024 * 1024;
const TIPOS = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

/** { tipo, tamanho } → { ext } ou { erro } */
function validarVideo({ tipo, tamanho } = {}) {
  const ext = TIPOS[String(tipo || '').toLowerCase()];
  if (!ext) return { erro: 'Formato não aceito. Envie um vídeo MP4 (ou MOV/WEBM).' };
  const n = Number(tamanho);
  if (!Number.isFinite(n) || n <= 0) return { erro: 'Tamanho do arquivo inválido.' };
  if (n > LIMITE_BYTES) return { erro: `O vídeo passa de ${LIMITE_BYTES / 1024 / 1024} MB. Comprima antes de enviar.` };
  return { ext };
}

/** Caminho no bucket: itens/<itemId>/<carimbo>.<ext> (nome novo a cada envio). */
function caminhoDoVideo(itemId, ext, carimbo) {
  return `itens/${itemId}/${carimbo}.${ext}`;
}

/** O caminho que o navegador devolve é mesmo deste item (e não de outro)? */
function caminhoEhDoItem(itemId, caminho) {
  if (typeof caminho !== 'string' || !itemId) return false;
  const prefixo = `itens/${itemId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  const resto = caminho.slice(prefixo.length);
  return /^[0-9]+\.(mp4|mov|webm)$/.test(resto);
}

/**
 * Link do YouTube (25/09/2026 · pedido do Marcos: "passamos um vídeo do YouTube
 * lá e a pessoa assiste dentro do app, sem sair"). Devolve o link CANÔNICO
 * (watch?v=<id>) ou null. ⚠️ Espelho de `idDoYoutube` do app
 * (lib/videoDevocional.ts) — os dois têm que aceitar os mesmos formatos.
 */
function linkDoYoutube(url) {
  if (typeof url !== 'string') return null;
  const m = url.trim().match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

module.exports = { BUCKET, LIMITE_BYTES, validarVideo, caminhoDoVideo, caminhoEhDoItem, linkDoYoutube };
