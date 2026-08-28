import { describe, expect, it } from 'vitest';
import { classificarErroDeTela } from './erroRecuperavel';

const MAX = 3;

describe('classificarErroDeTela', () => {
  it('recarrega em erro de chunk enquanto houver orçamento', () => {
    const r = classificarErroDeTela('Failed to fetch dynamically imported module', 0, MAX);
    expect(r).toEqual({ recuperavel: true, motivo: 'chunk' });
  });

  it('para de recarregar quando o orçamento acaba, mas ainda reconhece o motivo', () => {
    // Distinção que a tela usa: sem orçamento não recarregamos sozinhos, porém a
    // mensagem tem de continuar sendo a de atualização (com o Ctrl+Shift+R) e
    // não o texto cru do erro.
    const r = classificarErroDeTela('ChunkLoadError', MAX, MAX);
    expect(r).toEqual({ recuperavel: false, motivo: 'chunk' });
  });

  it('cobre a mensagem de cada navegador', () => {
    const mensagens = [
      'Loading chunk 42 failed',
      'error loading dynamically imported module',
      'Importing a module script failed',
      "'text/html' is not a valid JavaScript MIME type",
      'Expected a JavaScript module script',
    ];
    for (const m of mensagens) {
      expect(classificarErroDeTela(m, 0, MAX).motivo, m).toBe('chunk');
    }
  });

  // ── A guarda estreita dos hooks ──────────────────────────────────────────
  //
  // O bug do voluntariado (16/08/2026) chegou como #310 numa aba comum, SEM
  // contador de tentativas. Se ele fosse recuperável, a tela recarregaria,
  // quebraria de novo no mesmo componente e o erro sumiria do relato do
  // usuário — trocaríamos um bug visível por um loop invisível.

  it('NÃO recarrega em erro de hooks numa aba comum', () => {
    const r = classificarErroDeTela('Minified React error #310; visit https://react.dev/errors/310', 0, MAX);
    expect(r).toEqual({ recuperavel: false, motivo: null });
  });

  it('NÃO recarrega em #300 numa aba comum', () => {
    expect(classificarErroDeTela('Minified React error #300', 0, MAX).recuperavel).toBe(false);
  });

  it('recarrega em erro de hooks SÓ logo depois de uma atualização automática', () => {
    // retryCount > 0 significa que a aba se atualizou nos últimos 60s
    // (APP_UPDATE_RETRY_WINDOW_MS) e pode estar com módulos de duas versões.
    const r = classificarErroDeTela('Minified React error #310', 1, MAX);
    expect(r).toEqual({ recuperavel: true, motivo: 'hooks-pos-atualizacao' });
  });

  it('respeita o teto de tentativas também no caso dos hooks', () => {
    const r = classificarErroDeTela('Rendered more hooks than during the previous render', MAX, MAX);
    expect(r).toEqual({ recuperavel: false, motivo: 'hooks-pos-atualizacao' });
  });

  it('não confunde outro erro do React que só começa com #3', () => {
    // #31 e #3 existem e não têm nada a ver com ordem de hooks; o \b no regex
    // é o que impede a captura.
    expect(classificarErroDeTela('Minified React error #31', 1, MAX).motivo).toBeNull();
    expect(classificarErroDeTela('Minified React error #3001', 1, MAX).motivo).toBeNull();
  });

  it('erro comum de aplicação nunca é recuperável', () => {
    expect(classificarErroDeTela("Cannot read properties of undefined (reading 'nome')", 2, MAX))
      .toEqual({ recuperavel: false, motivo: null });
    expect(classificarErroDeTela(null, 1, MAX)).toEqual({ recuperavel: false, motivo: null });
    expect(classificarErroDeTela('', 1, MAX)).toEqual({ recuperavel: false, motivo: null });
  });
});
