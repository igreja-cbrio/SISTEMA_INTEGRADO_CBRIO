import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { lerNomeArquivo, pedidoDoNome, chaveDoNome } = require_('../../backend/utils/nfeArquivo.js');

/**
 * ⚠️⚠️ OS NOMES AQUI SÃO REAIS, tirados dos ZIPs que a igreja baixou em
 * 19/08/2026 (`IGREJACBRIO_20260801_20260831.zip`). Não são inventados, e é
 * isso que dá valor ao teste: a versão anterior desta régua passava em 9 casos
 * verdes e casava ZERO dos 45 DANFEs reais, porque eu havia generalizado o
 * padrão a partir de 2 arquivos baixados um a um pela tela do ML.
 *
 * Régua que fica: contrato de formato de terceiro se fixa com AMOSTRA REAL do
 * caminho que a operação usa de verdade — não com o exemplo mais fácil de obter.
 */

// Do ZIP em lote ("Baixar NF-e disponíveis") — o caminho que a igreja usa.
const PDF_LOTE = 'pdf/6678924263_35260855521517000118550020001272081387068918-DANFE.pdf';
const XML_LOTE = 'xml/6782584994_35260819556063000157550050000250521618175805-procNFe.xml';
// Do download unitário, pela tela do ML.
const PDF_UNIT = 'invoice-2000018017722108.pdf';
const XML_UNIT = 'invoice-2000017997981146.xml';

describe('nfeArquivo · ZIP em lote (o caso real)', () => {
  it('extrai a chave de acesso do DANFE', () => {
    expect(chaveDoNome(PDF_LOTE)).toBe('35260855521517000118550020001272081387068918');
    expect(lerNomeArquivo(PDF_LOTE)?.tipo).toBe('pdf');
  });

  it('extrai a chave de acesso do XML', () => {
    expect(chaveDoNome(XML_LOTE)).toBe('35260819556063000157550050000250521618175805');
    expect(lerNomeArquivo(XML_LOTE)?.tipo).toBe('xml');
  });

  it('⚠️ o nome do lote NÃO tem pedido do ML — e isso não pode virar erro', () => {
    // Era exatamente aqui que 45 de 45 DANFEs morriam: sem `invoice-`, a régua
    // antiga devolvia null e o arquivo era descartado como "nome sem pedido".
    expect(pedidoDoNome(PDF_LOTE)).toBeNull();
    expect(lerNomeArquivo(PDF_LOTE)).not.toBeNull();
    expect(chaveDoNome(PDF_LOTE)).toHaveLength(44);
  });

  it('o id de 10 dígitos antes do "_" NÃO é confundido com a chave', () => {
    // 6678924263 tem 10 dígitos; só a sequência de exatamente 44 vale.
    expect(chaveDoNome(PDF_LOTE)).not.toContain('6678924263');
  });
});

describe('nfeArquivo · download unitário (segue valendo)', () => {
  it('extrai o pedido do ML', () => {
    expect(pedidoDoNome(PDF_UNIT)).toBe('2000018017722108');
    expect(pedidoDoNome(XML_UNIT)).toBe('2000017997981146');
  });

  it('não inventa chave onde não há', () => {
    expect(chaveDoNome(PDF_UNIT)).toBeNull();
  });

  it('aceita o nome com prefixo de pasta e com "_" no lugar do "-"', () => {
    expect(pedidoDoNome('alguma/pasta/invoice-2000018017722108.pdf')).toBe('2000018017722108');
    expect(pedidoDoNome('invoice_2000018017722108.xml')).toBe('2000018017722108');
  });
});

describe('nfeArquivo · bordas da chave (é aqui que se inventa dado)', () => {
  it('⚠️ 43 e 45 dígitos NÃO viram chave', () => {
    expect(chaveDoNome(`pdf/x_${'1'.repeat(43)}-DANFE.pdf`)).toBeNull();
    expect(chaveDoNome(`pdf/x_${'1'.repeat(45)}-DANFE.pdf`)).toBeNull();
  });

  it('⚠️ sequência LONGA não é recortada nos 44 primeiros', () => {
    // Sem as bordas do regex isto devolveria uma chave inventada, que ou não
    // acha nota nenhuma (silencioso) ou acha a errada.
    expect(chaveDoNome(`pdf/${'9'.repeat(60)}-DANFE.pdf`)).toBeNull();
  });

  it('a chave pode estar em qualquer posição do nome', () => {
    const c = '3'.repeat(44);
    expect(chaveDoNome(`${c}.pdf`)).toBe(c);
    expect(chaveDoNome(`nota ${c} agosto.xml`)).toBe(c);
  });
});

describe('nfeArquivo · o que não é nota', () => {
  it('extensão desconhecida devolve null', () => {
    expect(lerNomeArquivo('relatorio.txt')).toBeNull();
    expect(lerNomeArquivo('planilha.xlsx')).toBeNull();
    expect(lerNomeArquivo('')).toBeNull();
    expect(lerNomeArquivo(null)).toBeNull();
  });

  it('XML de outra origem entra sem identificador, e isso é intencional', () => {
    // Nota do fornecedor por e-mail: o XML tem a chave DENTRO, então a
    // importação funciona — só não dá pra casar DANFE pelo nome.
    const r = lerNomeArquivo('NFe_fornecedor.xml');
    expect(r).toEqual({ orderId: null, chaveAcesso: null, tipo: 'xml' });
  });
});
