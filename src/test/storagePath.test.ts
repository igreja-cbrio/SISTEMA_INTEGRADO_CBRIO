import { describe, it, expect } from 'vitest';
import {
  caminhoNoBucket,
  caminhoSeguro,
  caminhosDosCampos,
  aplicarAssinaturas,
  caminhoDeUrlPublica,
  separarCaminhosPorBucket,
} from '../../backend/utils/storagePath.js';

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

// ============================================================================
// Bucket LEGADO convivendo com o atual na MESMA coluna (2026-09-17)
//
// ⚠️⚠️ O `rh_documentos.storage_path` guarda TRÊS formatos ao mesmo tempo: URL
// pública do `rh-fotos` (legado, de quando o bucket era público), caminho
// relativo do `documentos-rh` (o que o código grava hoje) e link do SharePoint.
// Assinar o caminho relativo no bucket ERRADO devolve uma URL assinada
// perfeitamente válida apontando para um objeto que não existe — link morto,
// sem erro e sem log. É esta a falha que estes casos existem para impedir.
// ============================================================================
describe('separarCaminhosPorBucket · legado × atual', () => {
  const ATUAL = 'documentos-rh';
  const LEGADO = 'rh-fotos';
  // O objeto REAL que estava no bucket público (medido em 2026-09-17).
  const URL_LEGADA =
    `${BASE}/rh-fotos/documentos/4df5e38b-9991-4cdd-9119-47b0e4a93de4/1787073838182_RG.pdf`;
  const CAMINHO_LEGADO = 'documentos/4df5e38b-9991-4cdd-9119-47b0e4a93de4/1787073838182_RG.pdf';

  it('URL pública do bucket legado vai para o LEGADO', () => {
    const r = separarCaminhosPorBucket([URL_LEGADA], ATUAL, LEGADO);
    expect(r.legado).toEqual([CAMINHO_LEGADO]);
    expect(r.atual).toEqual([]);
  });

  it('⚠️⚠️ caminho CRU vai para o ATUAL, nunca para o legado', () => {
    // Só o código novo grava caminho relativo, então ele é do bucket novo por
    // construção. Mandá-lo para o legado é o link morto silencioso.
    const r = separarCaminhosPorBucket(['documentos/abc/rg.pdf'], ATUAL, LEGADO);
    expect(r.atual).toEqual(['documentos/abc/rg.pdf']);
    expect(r.legado).toEqual([]);
  });

  it('URL pública do bucket ATUAL vai para o atual', () => {
    const r = separarCaminhosPorBucket([`${BASE}/documentos-rh/a/b.pdf`], ATUAL, LEGADO);
    expect(r.atual).toEqual(['a/b.pdf']);
    expect(r.legado).toEqual([]);
  });

  it('⚠️ link do SharePoint e URL de terceiro não entram em lista nenhuma', () => {
    const r = separarCaminhosPorBucket(
      ['https://cbrio.sharepoint.com/x/RG.pdf', 'https://exemplo.com/a.pdf', null, ''],
      ATUAL, LEGADO,
    );
    expect(r.atual).toEqual([]);
    expect(r.legado).toEqual([]);
  });

  it('os três formatos convivendo: cada um no seu balde', () => {
    const r = separarCaminhosPorBucket(
      [URL_LEGADA, 'documentos/novo/cpf.pdf', 'https://cbrio.sharepoint.com/x.pdf'],
      ATUAL, LEGADO,
    );
    expect(r.legado).toEqual([CAMINHO_LEGADO]);
    expect(r.atual).toEqual(['documentos/novo/cpf.pdf']);
  });

  it('deduplica dentro de cada bucket', () => {
    const r = separarCaminhosPorBucket([URL_LEGADA, URL_LEGADA, 'a/b.pdf', 'a/b.pdf'], ATUAL, LEGADO);
    expect(r.legado).toHaveLength(1);
    expect(r.atual).toHaveLength(1);
  });

  it('⚠️ sem bucket legado declarado, nada cai no legado', () => {
    const r = separarCaminhosPorBucket([URL_LEGADA], ATUAL, null);
    expect(r.legado).toEqual([]);
  });

  it('⚠️ travessia não vira caminho em bucket nenhum', () => {
    const r = separarCaminhosPorBucket(
      [`${BASE}/rh-fotos/../secreto.pdf`, '../fora.pdf'], ATUAL, LEGADO,
    );
    expect(r.atual).toEqual([]);
    expect(r.legado).toEqual([]);
  });
});

describe('caminhoDeUrlPublica · exige a marca do Storage', () => {
  it('caminho cru devolve null (é o que separa legado de atual)', () => {
    expect(caminhoDeUrlPublica('a/b.pdf', 'rh-fotos')).toBeNull();
  });

  it('URL pública daquele bucket devolve o caminho', () => {
    expect(caminhoDeUrlPublica(`${BASE}/rh-fotos/a/b.pdf`, 'rh-fotos')).toBe('a/b.pdf');
  });

  it('URL pública de OUTRO bucket devolve null', () => {
    expect(caminhoDeUrlPublica(`${BASE}/avatars/a/b.pdf`, 'rh-fotos')).toBeNull();
  });
});
