import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { lerNomeArquivo, pedidoDoNome } = require_('../../backend/utils/nfeArquivo.js');

// Nomes REAIS dos arquivos que o Mercado Livre entrega (19/08/2026):
//   invoice-2000017997981146.xml
//   invoice-2000018017722108.pdf

describe('lerNomeArquivo · o pedido está no NOME, não no XML', () => {
  it('lê o pedido e o tipo do XML real', () => {
    expect(lerNomeArquivo('invoice-2000017997981146.xml'))
      .toEqual({ orderId: '2000017997981146', tipo: 'xml' });
  });

  it('lê o pedido e o tipo do PDF real', () => {
    expect(lerNomeArquivo('invoice-2000018017722108.pdf'))
      .toEqual({ orderId: '2000018017722108', tipo: 'pdf' });
  });

  it('⚠️ XML e PDF do MESMO pedido dão o mesmo id — é o que casa os dois', () => {
    expect(pedidoDoNome('invoice-2000018017722108.xml'))
      .toBe(pedidoDoNome('invoice-2000018017722108.pdf'));
  });

  it('aceita caminho de dentro do ZIP', () => {
    expect(pedidoDoNome('notas/2026-08/invoice-2000018017722108.pdf'))
      .toBe('2000018017722108');
    expect(pedidoDoNome('pasta\\invoice-2000018017722108.xml'))
      .toBe('2000018017722108');
  });

  it('tolera maiúsculas e underscore', () => {
    expect(pedidoDoNome('INVOICE_2000018017722108.XML')).toBe('2000018017722108');
  });

  it('⚠️ nome fora do padrão NÃO inventa pedido — só diz o tipo', () => {
    // XML de outra origem (Arquivei, e-mail do fornecedor) tem que entrar na
    // mesma, só sem vínculo com pedido do ML.
    expect(lerNomeArquivo('NFe35260819556063000157.xml'))
      .toEqual({ orderId: null, tipo: 'xml' });
    expect(lerNomeArquivo('danfe qualquer.pdf'))
      .toEqual({ orderId: null, tipo: 'pdf' });
  });

  it('⚠️ não confunde outro número no nome com o pedido', () => {
    expect(pedidoDoNome('pedido-2000018017722108.xml')).toBeNull();
    expect(pedidoDoNome('2000018017722108.xml')).toBeNull();
  });

  it('arquivo que não é XML nem PDF é ignorado', () => {
    expect(lerNomeArquivo('invoice-2000018017722108.txt')).toBeNull();
    expect(lerNomeArquivo('leiame.doc')).toBeNull();
    expect(lerNomeArquivo('')).toBeNull();
    expect(lerNomeArquivo(null)).toBeNull();
  });

  it('exige um número plausível de pedido', () => {
    expect(pedidoDoNome('invoice-123.xml')).toBeNull(); // curto demais
    expect(pedidoDoNome('invoice-.xml')).toBeNull();
  });
});
