// Preparar imagem de arquivo pra ir como dataURL (16/09/2026).
//
// ⚠️⚠️ POR QUE ISTO EXISTE
// As rotas de foto do Kids (`/totem-kids/criancas/:id/foto` e
// `/responsaveis/:id/foto`) recebem **dataURL em JSON**, e `/api/totem-kids`
// cai no `express.json` GLOBAL de **1mb** (`backend/server.js`). Base64 engorda
// ~33%, então o teto real é de **~750KB de imagem** — e a tela dizia "máx 5MB".
// Acima disso o corpo morre NO PARSER, antes da rota: 413 com corpo que não é o
// nosso, e a pessoa lê um erro genérico sem entender o que fazer.
//
// ⚠️⚠️ MEDIDO EM 16/09: das 98 fotos no bucket, **a maior tem 68KB** e a mediana
// 43KB — a assinatura exata da captura por webcam do totem (640×480, JPEG 0.85).
// Nenhuma veio do seletor de arquivo. O caminho do `<input type="file">` nunca
// produziu um sucesso sequer.
//
// A saída não é aumentar o limite do servidor (mexeria em TODAS as rotas): é
// reduzir a imagem no navegador, que é onde ela já está. Foto de identificação
// de check-in é vista num avatar — 1024px sobra.

export const LADO_MAX_PADRAO = 1024;
export const QUALIDADE_PADRAO = 0.85;
/** Teto de segurança do dataURL, com folga pro 1mb do parser. */
export const TETO_DATAURL = 900 * 1024;

/**
 * Quanto a imagem precisa encolher pra caber no lado maior.
 *
 * ⚠️ NUNCA aumenta: foto pequena passa intacta. Esticar uma foto de 200px pra
 * 1024 só inventaria peso e borrão.
 *
 * @param largura  largura original
 * @param altura   altura original
 * @param ladoMax  maior lado permitido
 */
export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMax: number = LADO_MAX_PADRAO,
): { largura: number; altura: number } {
  const l = Number(largura);
  const a = Number(altura);
  // ⚠️ Dimensão que não é número positivo (imagem que não decodificou) devolve
  // o que veio: canvas de 0×0 gera dataURL vazio e a foto some sem erro.
  if (!Number.isFinite(l) || !Number.isFinite(a) || l <= 0 || a <= 0) {
    return { largura: l, altura: a };
  }
  const maior = Math.max(l, a);
  if (!Number.isFinite(ladoMax) || ladoMax <= 0 || maior <= ladoMax) {
    return { largura: Math.round(l), altura: Math.round(a) };
  }
  const fator = ladoMax / maior;
  return {
    // ⚠️ Mínimo de 1: arredondar pra baixo um lado muito estreito daria 0.
    largura: Math.max(1, Math.round(l * fator)),
    altura: Math.max(1, Math.round(a * fator)),
  };
}

function lerComoDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(new Error('Não consegui ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Não consegui abrir esta imagem.'));
    img.src = url;
  });
}

/**
 * Arquivo escolhido pela pessoa → dataURL JPEG já reduzido e dentro do teto.
 *
 * ⚠️ Se a redução falhar (formato exótico, canvas bloqueado), cai no arquivo
 * original — mas só quando ele CABE. Cair no original grande reintroduziria
 * exatamente a falha silenciosa que este módulo existe pra matar.
 */
export async function arquivoParaDataUrl(
  file: File,
  { ladoMax = LADO_MAX_PADRAO, qualidade = QUALIDADE_PADRAO }: { ladoMax?: number; qualidade?: number } = {},
): Promise<string> {
  const original = await lerComoDataUrl(file);
  try {
    const img = await carregarImagem(original);
    const { largura, altura } = dimensoesReduzidas(img.naturalWidth, img.naturalHeight, ladoMax);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');
    ctx.drawImage(img, 0, 0, largura, altura);

    // ⚠️ Foto muito detalhada ainda pode passar do teto mesmo reduzida. Baixa a
    // qualidade em degraus em vez de recusar: a pessoa quer a foto no sistema,
    // não uma aula sobre compressão.
    let saida = canvas.toDataURL('image/jpeg', qualidade);
    for (const q of [0.7, 0.55, 0.4]) {
      if (saida.length <= TETO_DATAURL) break;
      saida = canvas.toDataURL('image/jpeg', q);
    }
    if (saida.length > TETO_DATAURL) {
      throw new Error('Esta imagem é pesada demais mesmo reduzida. Tente outra foto.');
    }
    return saida;
  } catch (e) {
    if (original.length <= TETO_DATAURL) return original;
    throw e instanceof Error ? e : new Error('Não consegui preparar esta imagem.');
  }
}
