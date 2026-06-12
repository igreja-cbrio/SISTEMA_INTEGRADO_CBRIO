// Comprime/redimensiona uma imagem no navegador antes do upload.
// Necessário porque as serverless functions do Vercel rejeitam corpo de
// requisição > 4,5 MB — foto de câmera (8–15 MB) derruba a conexão e o
// fetch falha ("Falha ao fetch"). Também poupa banda de quem vê no app.
export async function comprimirImagem(file, { maxLado = 1920, qualidade = 0.85 } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    // imageOrientation respeita o EXIF (foto de celular não vira deitada)
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', qualidade));
    if (!blob) return file;
    // Se por algum motivo a compressão aumentou (raro, imagem já otimizada
    // e pequena), mantém a original — desde que caiba no limite do Vercel.
    if (blob.size >= file.size && file.size < 4 * 1024 * 1024) return file;
    const nome = (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return file; // fallback: tenta com a original
  }
}
