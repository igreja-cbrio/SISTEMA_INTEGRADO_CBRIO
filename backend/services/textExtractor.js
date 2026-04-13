/**
 * Text Extractor — extrai texto de arquivos (PDF, DOCX, XLSX, PPTX).
 * Retorna '[IMAGEM]' para imagens e PDFs escaneados (digest usa visão).
 * Retorna '[VIDEO:nome]' para vídeos (só registra no relatório).
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi'];

async function extractText(buffer, mimeType, fileName, maxChars = 15000) {
  try {
    // Imagens → marcador para visão do Haiku
    if (IMAGE_TYPES.includes(mimeType)) return '[IMAGEM]';

    // Vídeos → apenas registrar nome
    if (VIDEO_TYPES.includes(mimeType) || fileName?.match(/\.(mp4|mov|webm|avi)$/i)) {
      return `[VIDEO:${fileName}]`;
    }

    // PDF
    if (mimeType === 'application/pdf') {
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      const text = (data.text || '').trim();
      // PDF escaneado (sem texto real) → tratar como imagem
      if (text.length < 50) return '[IMAGEM]';
      return text.slice(0, maxChars);
    }

    // DOCX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName?.endsWith('.docx')) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.slice(0, maxChars) || '';
    }

    // XLSX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName?.endsWith('.xlsx')) {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      for (const name of workbook.SheetNames) {
        text += `\n--- Planilha: ${name} ---\n`;
        text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      }
      return text.slice(0, maxChars);
    }

    // PPTX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || fileName?.endsWith('.pptx')) {
      const officeparser = require('officeparser');
      const text = await officeparser.parseOfficeAsync(buffer);
      return (text || '').slice(0, maxChars);
    }

    // Texto puro (txt, csv, md, json)
    if (mimeType?.startsWith('text/') || mimeType === 'application/json' || fileName?.match(/\.(txt|csv|md|json)$/i)) {
      return buffer.toString('utf-8').slice(0, maxChars);
    }

    // Outros binários
    return `[Arquivo binário: ${fileName || 'desconhecido'}, tipo: ${mimeType}]`;
  } catch (e) {
    return `[Erro ao extrair texto de ${fileName}: ${e.message}]`;
  }
}

module.exports = { extractText, IMAGE_TYPES, VIDEO_TYPES };
