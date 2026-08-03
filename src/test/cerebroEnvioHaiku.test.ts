import { describe, it, expect } from 'vitest';

// @ts-expect-error módulo JS sem tipos
import { montarEnvioHaiku } from '../../backend/services/cerebroEnvioHaiku.js';

/**
 * Guarda do bug real: 5 PDFs da biblioteca Planejamento ficaram em `erro` desde
 * abril/junho de 2026 com 400 em
 * `messages.0.content.0.image.source.base64.media_type` — porque PDF sem texto
 * extraível caía no bloco `image` levando `media_type: 'application/pdf'`.
 *
 * A regra que não pode voltar: media_type de bloco `image` é SEMPRE um
 * `image/*`. PDF sem texto vai como bloco `document`.
 */

const PROMPT = 'classifique este documento';
const B64 = 'ZmFrZQ==';

describe('cerebro · como o arquivo vai pro Haiku', () => {
  it('⚠️ PDF sem texto vai como DOCUMENTO, nunca como imagem', () => {
    const r = montarEnvioHaiku({
      mimeType: 'application/pdf', texto: '[IMAGEM]', base64: B64, prompt: PROMPT,
    });
    expect(r.modo).toBe('documento');
    expect(r.content[0].type).toBe('document');
    expect(r.content[0].source.media_type).toBe('application/pdf');
  });

  it('nenhum bloco image sai com media_type que não seja image/*', () => {
    // Se alguém reverter pro `if (texto === '[IMAGEM]' || ...)` inline, este
    // teste pega: o PDF volta a virar bloco image com application/pdf.
    for (const mimeType of ['application/pdf', 'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
      const r = montarEnvioHaiku({ mimeType, texto: '[IMAGEM]', base64: B64, prompt: PROMPT });
      const blocos = Array.isArray(r.content) ? r.content : [];
      for (const b of blocos) {
        if (b.type === 'image') {
          expect(b.source.media_type, `bloco image com ${b.source.media_type}`).toMatch(/^image\//);
        }
      }
    }
  });

  it('imagem de verdade segue como imagem, com o próprio media_type', () => {
    for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) {
      const r = montarEnvioHaiku({ mimeType, texto: '[IMAGEM]', base64: B64, prompt: PROMPT });
      expect(r.modo).toBe('imagem');
      expect(r.content[0].source.media_type).toBe(mimeType);
    }
  });

  it('tipo não-imagem e não-PDF sem texto é IGNORADO com motivo legível', () => {
    // Mandar buffer arbitrário como imagem só produziria outro 400.
    const r = montarEnvioHaiku({
      mimeType: 'application/octet-stream', texto: '[VAZIO]', base64: B64, prompt: PROMPT,
    });
    expect(r.modo).toBe('ignorar');
    expect(r.motivo).toContain('application/octet-stream');
  });

  it('texto curto demais não é tratado como conteúdo', () => {
    const r = montarEnvioHaiku({
      mimeType: 'text/plain', texto: 'oi', base64: B64, prompt: PROMPT,
    });
    expect(r.modo).toBe('ignorar');
  });

  it('documento com texto vai como texto, com o prompt e o conteúdo', () => {
    const texto = 'a'.repeat(200);
    const r = montarEnvioHaiku({ mimeType: 'text/plain', texto, base64: B64, prompt: PROMPT });
    expect(r.modo).toBe('texto');
    expect(r.content).toContain(PROMPT);
    expect(r.content).toContain(texto);
  });
});
