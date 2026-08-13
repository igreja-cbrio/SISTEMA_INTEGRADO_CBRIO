import { describe, it, expect } from 'vitest';
import { normalizarBusca, contemNormalizado, algumContemNormalizado } from '@/lib/busca';

// Determinístico de propósito: nada de data/hora/locale do ambiente (lição do
// faixaEtaria.test.ts, que quebrava depois das 21h BRT).
describe('normalizarBusca', () => {
  it('tira acento, caixa e espaço extra', () => {
    expect(normalizarBusca('  Antônio   MARCO  Pereira ')).toBe('antonio marco pereira');
    expect(normalizarBusca('ANTONIO')).toBe('antonio');
  });

  it('cobre cedilha, til, circunflexo, agudo e crase', () => {
    expect(normalizarBusca('AÇÃO')).toBe('acao');
    expect(normalizarBusca('José Antônio à Vovó')).toBe('jose antonio a vovo');
  });

  it('trata nulo/indefinido/número sem estourar', () => {
    expect(normalizarBusca(null)).toBe('');
    expect(normalizarBusca(undefined)).toBe('');
    expect(normalizarBusca(0 as unknown as string)).toBe('0');
  });

  it('normaliza NFD igual a NFC (o mesmo nome digitado de 2 jeitos)', () => {
    // "Antonio" com circunflexo pre-composto (NFC) x decomposto (NFD, como
    // alguns teclados/iOS mandam): 'o' + combining circumflex (U+0302).
    const nfd = 'Anto' + String.fromCharCode(0x302) + 'nio';
    const nfc = 'Ant' + String.fromCharCode(0xf4) + 'nio';
    expect(nfd).not.toBe(nfc); // strings diferentes byte a byte
    expect(normalizarBusca(nfd)).toBe('antonio');
    expect(normalizarBusca(nfd)).toBe(normalizarBusca(nfc));
  });
});

describe('contemNormalizado · acento nos DOIS sentidos', () => {
  // O caso que motivou a feature: líder cadastrado sem acento, pessoa digitando
  // a grafia correta (e vice-versa).
  it('termo sem acento acha alvo sem acento', () => {
    expect(contemNormalizado('ANTONIO MARCO PEREIRA', 'antonio')).toBe(true);
  });
  it('termo COM acento acha alvo SEM acento', () => {
    expect(contemNormalizado('ANTONIO MARCO PEREIRA', 'Antônio')).toBe(true);
  });
  it('termo SEM acento acha alvo COM acento', () => {
    expect(contemNormalizado('Antônio Marco Pereira', 'antonio')).toBe(true);
    expect(contemNormalizado('José da Silva', 'jose')).toBe(true);
  });
  it('cedilha nos dois sentidos', () => {
    expect(contemNormalizado('acao social', 'AÇÃO')).toBe(true);
    expect(contemNormalizado('Ação Social', 'acao')).toBe(true);
  });
  it('ignora caixa e espaço extra do termo', () => {
    expect(contemNormalizado('Grupo Vida Centro', '  vida    CENTRO ')).toBe(true);
  });
  it('não casa quem não tem o termo', () => {
    expect(contemNormalizado('ANTONIO MARCO PEREIRA', 'joao')).toBe(false);
    expect(contemNormalizado(null, 'joao')).toBe(false);
  });
  it('termo vazio/espaços não filtra', () => {
    expect(contemNormalizado('qualquer coisa', '')).toBe(true);
    expect(contemNormalizado('qualquer coisa', '   ')).toBe(true);
  });
});

describe('algumContemNormalizado · nomes + apelidos do líder', () => {
  const alvos = ['ANTONIO MARCO PEREIRA', 'Tuninho'];

  it('acha pelo apelido, com e sem acento', () => {
    expect(algumContemNormalizado(alvos, 'tuninho')).toBe(true);
    expect(algumContemNormalizado(alvos, 'Tunínho')).toBe(true);
  });
  it('acha pelo nome real', () => {
    expect(algumContemNormalizado(alvos, 'Antônio')).toBe(true);
    expect(algumContemNormalizado(alvos, 'pereira')).toBe(true);
  });
  it('não casa termo estranho e tolera lista vazia/nula', () => {
    expect(algumContemNormalizado(alvos, 'zezinho')).toBe(false);
    expect(algumContemNormalizado([], 'antonio')).toBe(false);
    expect(algumContemNormalizado(null as unknown as string[], 'antonio')).toBe(false);
  });
});
