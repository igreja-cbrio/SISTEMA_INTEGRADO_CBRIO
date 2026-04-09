/**
 * Text Extractor — extrai texto de arquivos (PDF, DOCX, XLSX).
 * Usado no digest (upload) e fallback do relatório.
 */

async function extractText(buffer, mimeType, fileName, maxChars = 15000) {
  try {
    if (mimeType === 'application/pdf') {
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      return data.text?.slice(0, maxChars) || '';
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName?.endsWith('.docx')) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.slice(0, maxChars) || '';
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName?.endsWith('.xlsx')) {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        text += `\n--- Planilha: ${name} ---\n`;
        text += XLSX.utils.sheet_to_csv(sheet);
      }
      return text.slice(0, maxChars);
    }
    return `[Arquivo binário: ${fileName || 'desconhecido'}, tipo: ${mimeType}]`;
  } catch (e) {
    return `[Erro ao extrair texto de ${fileName}: ${e.message}]`;
  }
}

module.exports = { extractText };
