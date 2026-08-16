import { describe, it, expect } from 'vitest';
// @ts-expect-error — utilitário CommonJS do backend, sem tipos
import * as storagePath from '../../backend/utils/storagePath.js';

const { caminhoNoBucket, caminhoSeguro, caminhosDosCampos, aplicarAssinaturas } =
  storagePath as {
    caminhoNoBucket: (v: unknown, b: string) => string | null;
    caminhoSeguro: (p: unknown) => string | null;
    caminhosDosCampos: (o: unknown, c: string[], b: string) => string[];
    aplicarAssinaturas: (o: any, c: string[], b: string, m: Record<string, string>) => any;
  };

const BASE = 'https://hhntwfawfnxvuobhdfkb.supabase.co/storage/v1/object/public';

describe('caminhoNoBucket · o que é NOSSO', () => {
  it('extrai o caminho de uma URL pública do bucket', () => {
    expect(caminhoNoBucket(`${BASE}/solicitacoes/anexos/2026/foto.jpg`, 'solicitacoes'))
      .toBe('anexos/2026/foto.jpg');
  });

  it('aceita caminho cru (idempotente — assinar duas vezes não pode virar URL de URL)', () => {
    expect(caminhoNoBucket('anexos/2026/foto.jpg', 'solicitacoes')).toBe('anexos/2026/foto.jpg');
  });

  it('descarta a query string de cache-busting', () => {
    expect(caminhoNoBucket(`${BASE}/solicitacoes/a/b.png?t=123`, 'solicitacoes')).toBe('a/b.png');
  });

  it('decodifica percent-encoding (nome de arquivo com espaço e acento)', () => {
    expect(caminhoNoBucket(`${BASE}/solicitacoes/nota%20fiscal%20ac%C3%A9nto.pdf`, 'solicitacoes'))
      .toBe('nota fiscal acénto.pdf');
  });
});

describe('caminhoNoBucket · o que NÃO é nosso (fail-closed)', () => {
  it('recusa URL de OUTRO bucket', () => {
    expect(caminhoNoBucket(`${BASE}/comprovantes/a.jpg`, 'solicitacoes')).toBeNull();
  });

  it('⚠️ recusa bucket com PREFIXO igual — rh-fotos NÃO casa em rh-fotos-antigo', () => {
    // Sem comparar `/<bucket>/` inteiro, `includes('rh-fotos')` casaria aqui e a
    // assinatura (ou uma limpeza) miraria o arquivo do bucket errado.
    expect(caminhoNoBucket(`${BASE}/rh-fotos-antigo/a.jpg`, 'rh-fotos')).toBeNull();
  });

  it('recusa URL externa (SharePoint, que convive na mesma coluna)', () => {
    expect(caminhoNoBucket('https://cbrio.sharepoint.com/sites/x/doc.pdf', 'solicitacoes')).toBeNull();
  });

  it('recusa vazio, nulo e não-string', () => {
    expect(caminhoNoBucket('', 'solicitacoes')).toBeNull();
    expect(caminhoNoBucket(null, 'solicitacoes')).toBeNull();
    expect(caminhoNoBucket(undefined, 'solicitacoes')).toBeNull();
  });

  it('recusa quando o bucket não é informado', () => {
    expect(caminhoNoBucket(`${BASE}/solicitacoes/a.jpg`, '')).toBeNull();
  });

  it('recusa percent-encoding quebrado em vez de estourar', () => {
    expect(caminhoNoBucket(`${BASE}/solicitacoes/%E0%A4%A.jpg`, 'solicitacoes')).toBeNull();
  });
});

describe('caminhoSeguro · travessia e caminho absoluto', () => {
  it('⚠️ recusa travessia — um `..` escapa da pasta pretendida', () => {
    expect(caminhoSeguro('a/../../../etc/passwd')).toBeNull();
    expect(caminhoNoBucket(`${BASE}/solicitacoes/a/../../segredo.pdf`, 'solicitacoes')).toBeNull();
  });

  it('recusa caminho absoluto', () => {
    expect(caminhoSeguro('/etc/passwd')).toBeNull();
  });

  it('aceita ponto duplo DENTRO do nome (arquivo..pdf não é travessia)', () => {
    expect(caminhoSeguro('pasta/arquivo..pdf')).toBe('pasta/arquivo..pdf');
  });
});

describe('caminhosDosCampos · string e array (imagens_url é jsonb com lista)', () => {
  const linha = {
    documento_url: `${BASE}/solicitacoes/doc.pdf`,
    imagens_url: [`${BASE}/solicitacoes/a.jpg`, `${BASE}/solicitacoes/b.jpg`],
    outro: 'https://externo.com/x.png',
  };

  it('junta os caminhos de campos string e array', () => {
    expect(caminhosDosCampos(linha, ['documento_url', 'imagens_url'], 'solicitacoes').sort())
      .toEqual(['a.jpg', 'b.jpg', 'doc.pdf']);
  });

  it('ignora campo que não é do bucket', () => {
    expect(caminhosDosCampos(linha, ['outro'], 'solicitacoes')).toEqual([]);
  });

  it('deduplica o mesmo arquivo citado 2x (assinar em lote não pode pedir repetido)', () => {
    const rep = { imagens_url: [`${BASE}/solicitacoes/a.jpg`, 'a.jpg'] };
    expect(caminhosDosCampos(rep, ['imagens_url'], 'solicitacoes')).toEqual(['a.jpg']);
  });

  it('tolera objeto nulo e lista de campos vazia', () => {
    expect(caminhosDosCampos(null, ['x'], 'solicitacoes')).toEqual([]);
    expect(caminhosDosCampos({}, [], 'solicitacoes')).toEqual([]);
  });
});

describe('aplicarAssinaturas', () => {
  const mapa = { 'a.jpg': 'https://assinada/a', 'doc.pdf': 'https://assinada/doc' };

  it('troca URL pública pela assinada, em string e em array', () => {
    const linha = {
      documento_url: `${BASE}/solicitacoes/doc.pdf`,
      imagens_url: [`${BASE}/solicitacoes/a.jpg`],
    };
    const out = aplicarAssinaturas(linha, ['documento_url', 'imagens_url'], 'solicitacoes', mapa);
    expect(out.documento_url).toBe('https://assinada/doc');
    expect(out.imagens_url).toEqual(['https://assinada/a']);
  });

  it('⚠️ NÃO muta a linha original (a mesma linha é reusada noutro ponto da resposta)', () => {
    const linha = { imagens_url: [`${BASE}/solicitacoes/a.jpg`] };
    const out = aplicarAssinaturas(linha, ['imagens_url'], 'solicitacoes', mapa);
    expect(linha.imagens_url).toEqual([`${BASE}/solicitacoes/a.jpg`]);
    expect(out).not.toBe(linha);
  });

  it('⚠️ deixa INTACTO o que não reconhece — a coluna guarda link do SharePoint também', () => {
    const linha = { documento_url: 'https://cbrio.sharepoint.com/x.pdf' };
    const out = aplicarAssinaturas(linha, ['documento_url'], 'solicitacoes', mapa);
    expect(out.documento_url).toBe('https://cbrio.sharepoint.com/x.pdf');
  });

  it('deixa intacto quando a assinatura daquele arquivo falhou (não está no mapa)', () => {
    const linha = { imagens_url: [`${BASE}/solicitacoes/sem-assinatura.jpg`] };
    const out = aplicarAssinaturas(linha, ['imagens_url'], 'solicitacoes', mapa);
    expect(out.imagens_url).toEqual([`${BASE}/solicitacoes/sem-assinatura.jpg`]);
  });

  it('tolera objeto nulo e campo ausente', () => {
    expect(aplicarAssinaturas(null, ['x'], 'solicitacoes', mapa)).toBeNull();
    expect(aplicarAssinaturas({ a: 1 }, ['imagens_url'], 'solicitacoes', mapa)).toEqual({ a: 1 });
  });
});
