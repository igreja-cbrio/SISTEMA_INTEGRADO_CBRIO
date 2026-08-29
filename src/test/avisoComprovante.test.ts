import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { destinatarioDaInscricao, tokenConfereComInscricao, montarAviso } = require('../../backend/utils/avisoComprovante');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
// Espelha `verificarTokenComprovante`: token -> id da inscrição.
const verificar = (t: string) => (t === `tk:${A}` ? A : t === `tk:${B}` ? B : null);

describe('⚠️ a guarda que impede uma pessoa receber o QR da outra', () => {
  it('token da própria inscrição passa', () => {
    expect(tokenConfereComInscricao(`tk:${A}`, A, verificar)).toBe(true);
  });

  it('⚠️ token de OUTRA inscrição é recusado — é o bug que não pode existir', () => {
    expect(tokenConfereComInscricao(`tk:${B}`, A, verificar)).toBe(false);
  });

  it('token inválido, vazio ou verificador quebrado recusam (fail-closed)', () => {
    expect(tokenConfereComInscricao('lixo', A, verificar)).toBe(false);
    expect(tokenConfereComInscricao('', A, verificar)).toBe(false);
    expect(tokenConfereComInscricao(`tk:${A}`, A, () => { throw new Error('x'); })).toBe(false);
    expect(tokenConfereComInscricao(`tk:${A}`, A, undefined as never)).toBe(false);
  });

  it('compara sem depender da caixa do uuid', () => {
    expect(tokenConfereComInscricao(`tk:${A}`, A.toUpperCase(), verificar)).toBe(true);
  });
});

describe('destinatarioDaInscricao', () => {
  it('o que a pessoa escreveu na inscrição vence o do cadastro', () => {
    expect(destinatarioDaInscricao({ email: 'Dela@X.com' }, { email: 'cadastro@x.com' })).toBe('dela@x.com');
  });
  it('cai no cadastro quando a inscrição não tem', () => {
    expect(destinatarioDaInscricao({ email: null }, { email: 'cadastro@x.com' })).toBe('cadastro@x.com');
  });
  it('lixo não vira destinatário', () => {
    expect(destinatarioDaInscricao({ email: 'nao tenho' }, null)).toBeNull();
    expect(destinatarioDaInscricao({ email: '-' }, null)).toBeNull();
    expect(destinatarioDaInscricao({}, {})).toBeNull();
  });
});

describe('montarAviso', () => {
  const evento = { nome: 'Celebra 2026', tem_sorteio: true };
  const insc = { nome_completo: 'Maria Souza Lima', numero_sorte: 9672 };

  it('⚠️ o NOME vai no assunto — caixa compartilhada em família é o caso comum', () => {
    const m = montarAviso({ inscricao: insc, evento, link: 'https://x/i/c/t' });
    expect(m.subject).toContain('Maria Souza Lima');
    expect(m.subject).toContain('Celebra 2026');
  });

  it('o corpo diz de QUEM é o comprovante e traz o número', () => {
    const m = montarAviso({ inscricao: insc, evento, link: 'https://x/i/c/t' });
    expect(m.html).toContain('Maria Souza Lima');
    expect(m.html).toContain('9672');
    expect(m.text).toContain('9672');
  });

  it('evento sem sorteio não inventa número da sorte', () => {
    const m = montarAviso({ inscricao: { nome_completo: 'X', numero_sorte: 5 }, evento: { nome: 'E', tem_sorteio: false }, link: 'l' });
    expect(m.html).not.toContain('número da sorte');
    expect(m.text).not.toContain('numero da sorte');
  });

  it('o link entra no html e no texto', () => {
    const m = montarAviso({ inscricao: insc, evento, link: 'https://cbrio.org/i/c/abc' });
    expect(m.html).toContain('https://cbrio.org/i/c/abc');
    expect(m.text).toContain('https://cbrio.org/i/c/abc');
  });

  it('nome com aspas/HTML não quebra o corpo', () => {
    const m = montarAviso({ inscricao: { nome_completo: 'A <b>"x"</b>', numero_sorte: 1 }, evento, link: 'l' });
    expect(m.html).not.toContain('<b>');
    expect(m.html).toContain('&lt;b&gt;');
  });
});
