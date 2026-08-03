/**
 * Cérebro · COMO o arquivo vai pro Haiku (decisão pura, sem I/O)
 *
 * ⚠️ Vive em módulo próprio porque `cerebroProcessor.js` importa o SDK da
 * Anthropic no topo, e o gate de deploy roda o Vitest na RAIZ (onde
 * `@anthropic-ai/sdk` não está instalado — ele é dependência do backend). Função
 * pura em módulo separado é o que a torna testável, mesmo padrão do
 * `src/lib/pinosMapa.ts`.
 *
 * ⚠️ `IMAGE_TYPES` é IMPORTADO do textExtractor, nunca copiado: quem decide o
 * que é imagem é ele, e duas listas divergentes é como um tipo novo passa a ser
 * imagem num arquivo e não no outro. Os requires de lib do textExtractor são
 * lazy (dentro das funções), então importá-lo aqui não carrega pdf-parse & cia.
 *
 * O bug que existiu (5 PDFs da biblioteca Planejamento parados como `erro` desde
 * abril/junho de 2026): a decisão era `if (texto === '[IMAGEM]' ||
 * IMAGE_TYPES.includes(mimeType))` inline no laço da fila. PDF escaneado (ou
 * arte exportada em PDF) devolve `'[IMAGEM]'` do extrator, entrava nesse ramo, e
 * o bloco `image` saía com `media_type: 'application/pdf'` — que não é
 * `image/*`. A API responde 400 em
 * `messages.0.content.0.image.source.base64.media_type`, e a linha morria como
 * erro terminal, sem ninguém saber.
 */
const { IMAGE_TYPES } = require('./textExtractor');

/** Texto que o extrator devolveu não serve como conteúdo pro prompt. */
function semConteudoUtil(texto) {
  const t = String(texto || '');
  // '[IMAGEM]', '[VÍDEO:nome]' e afins são MARCADORES do extrator, não texto.
  return t === '[IMAGEM]' || t.startsWith('[') || t.trim().length < 50;
}

/**
 * @returns {{modo:'imagem'|'documento'|'texto'|'ignorar', content?:any, motivo?:string}}
 */
function montarEnvioHaiku({ mimeType, texto, base64, prompt }) {
  // Imagem de verdade → bloco image com o PRÓPRIO media_type dela.
  if (IMAGE_TYPES.includes(mimeType)) {
    return {
      modo: 'imagem',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    };
  }

  if (semConteudoUtil(texto)) {
    // PDF sem texto extraível: a API lê PDF nativamente (inclusive escaneado)
    // pelo bloco `document`. É o caminho que os 5 PDFs nunca tiveram.
    if (mimeType === 'application/pdf') {
      return {
        modo: 'documento',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt },
        ],
      };
    }
    // Qualquer outro tipo sem texto: ignorar com motivo LEGÍVEL. Mandar buffer
    // arbitrário como imagem só produziria outro 400 difícil de diagnosticar.
    return { modo: 'ignorar', motivo: `Sem conteúdo extraível (${mimeType})` };
  }

  return { modo: 'texto', content: prompt + '\n\nConteudo:\n---\n' + texto + '\n---' };
}

module.exports = { montarEnvioHaiku, semConteudoUtil };
