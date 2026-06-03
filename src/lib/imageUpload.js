// Helper de processamento de imagem antes do upload.
// - Detecta HEIC (iPhone/Mac) por mime ou extensão e converte pra JPEG via heic-to (lazy import)
// - Redimensiona via canvas pro maior lado não passar de maxDim
// - Reencoda como JPEG comprimido (quality)
// - Garante saída sempre em File JPEG com nome estavel

const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_MIME_RE = /^image\/(heic|heif)$/i;

export function isHeic(file) {
  if (!file) return false;
  if (HEIC_MIME_RE.test(file.type || '')) return true;
  if (HEIC_EXT_RE.test(file.name || '')) return true;
  return false;
}

async function heicParaJpeg(file) {
  const mod = await import('heic-to');
  const blob = await mod.heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
  return new File([blob], (file.name || 'foto').replace(HEIC_EXT_RE, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function carregarImagem(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui ler a imagem'));
    };
    img.src = url;
  });
}

function canvasParaBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao codificar imagem'))), type, quality);
  });
}

async function redimensionarEComprimir(file, { maxDim = 1024, quality = 0.85 } = {}) {
  const img = await carregarImagem(file);
  const { width, height } = img;
  const escala = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * escala);
  const h = Math.round(height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasParaBlob(canvas, 'image/jpeg', quality);
  const baseNome = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], baseNome + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

// Processa o arquivo para upload de foto de perfil.
// onProgress?: (status: 'convertendo' | 'comprimindo') => void
export async function processarImagemPerfil(file, opts = {}) {
  const { maxDim = 1024, quality = 0.85, onProgress } = opts;
  let trabalho = file;
  if (isHeic(file)) {
    onProgress?.('convertendo');
    trabalho = await heicParaJpeg(file);
  }
  onProgress?.('comprimindo');
  return redimensionarEComprimir(trabalho, { maxDim, quality });
}
