import { describe, it, expect } from 'vitest';

import { ipDentroDoCerco, sanitizarIps, ipv4ParaInt, ALFABETO, CODIGO_LEN } from '../../backend/utils/totemCerco.js';

// O token do totem vive no localStorage de um PC de hall público: é bearer e
// extraível por quem senta na frente dele. O cerco de rede é a única mitigação
// que continua valendo depois de a credencial ser copiada — então afrouxá-lo é
// perder a proteção em silêncio. Estes testes existem pra isso doer no gate.

describe('ipDentroDoCerco · fail-closed', () => {
  it('sem cerco configurado, passa (é a config "qualquer rede")', () => {
    expect(ipDentroDoCerco('191.0.2.10', null)).toBe(true);
    expect(ipDentroDoCerco('191.0.2.10', [])).toBe(true);
    expect(ipDentroDoCerco('191.0.2.10', undefined)).toBe(true);
  });

  it('IP exato dentro do cerco passa; fora, não', () => {
    expect(ipDentroDoCerco('191.0.2.10', ['191.0.2.10'])).toBe(true);
    expect(ipDentroDoCerco('191.0.2.11', ['191.0.2.10'])).toBe(false);
  });

  it('CIDR /24 cobre a faixa e recusa a vizinha', () => {
    expect(ipDentroDoCerco('191.0.2.200', ['191.0.2.0/24'])).toBe(true);
    expect(ipDentroDoCerco('191.0.3.1', ['191.0.2.0/24'])).toBe(false);
  });

  it('/32 é host único e /0 é o mundo (não estoura no shift)', () => {
    expect(ipDentroDoCerco('10.0.0.1', ['10.0.0.1/32'])).toBe(true);
    expect(ipDentroDoCerco('10.0.0.2', ['10.0.0.1/32'])).toBe(false);
    // `1 << 32` é 1 em JS (shift é mod 32) — sem o caso próprio, /0 recusaria
    // tudo em vez de aceitar tudo.
    expect(ipDentroDoCerco('8.8.8.8', ['0.0.0.0/0'])).toBe(true);
  });

  it('aceita quando QUALQUER regra da lista casa', () => {
    expect(ipDentroDoCerco('172.16.5.5', ['191.0.2.0/24', '172.16.0.0/12'])).toBe(true);
  });

  // ⚠️ MUTATION TEST do desenho: trocar o `return false` do IP inválido por
  // `return true` ("não deu pra comparar, deixa passar") faz estes 4 casos
  // ficarem vermelhos. É exatamente essa mudança, feita de boa-fé, que
  // transformaria o cerco num enfeite — bastaria o cliente chegar por IPv6.
  it('COM cerco, IP que não dá pra comparar é RECUSADO', () => {
    expect(ipDentroDoCerco('2804:14d:1::1', ['191.0.2.0/24'])).toBe(false);
    expect(ipDentroDoCerco('::1', ['191.0.2.0/24'])).toBe(false);
    expect(ipDentroDoCerco('', ['191.0.2.0/24'])).toBe(false);
    expect(ipDentroDoCerco(null, ['191.0.2.0/24'])).toBe(false);
  });

  it('regra malformada é ignorada sem derrubar as válidas', () => {
    expect(ipDentroDoCerco('191.0.2.10', ['nao-e-ip', '191.0.2.0/24'])).toBe(true);
    // ...e uma lista SÓ de lixo não vira "passa todo mundo"
    expect(ipDentroDoCerco('191.0.2.10', ['nao-e-ip', '999.999.0.0/24'])).toBe(false);
  });

  it('octeto > 255 não é IP', () => {
    expect(ipv4ParaInt('256.0.0.1')).toBe(null);
    expect(ipDentroDoCerco('256.0.0.1', ['256.0.0.1'])).toBe(false);
  });
});

describe('sanitizarIps · o que a equipe digitou', () => {
  it('vazio significa sem cerco, sem reclamar', () => {
    expect(sanitizarIps('')).toEqual({ lista: null, descartados: [] });
    expect(sanitizarIps(null)).toEqual({ lista: null, descartados: [] });
  });

  it('separa por espaço, vírgula e ponto e vírgula', () => {
    expect(sanitizarIps('191.0.2.1, 191.0.2.2;191.0.2.0/24').lista)
      .toEqual(['191.0.2.1', '191.0.2.2', '191.0.2.0/24']);
  });

  // ⚠️ O caso que importa: entrada errada NÃO pode virar "salvo" silencioso. A
  // equipe acreditaria que o totem está cercado quando ele não está.
  it('devolve o que descartou pra a tela poder avisar', () => {
    const r = sanitizarIps('191.0.2.1 ip-do-roteador');
    expect(r.lista).toEqual(['191.0.2.1']);
    expect(r.descartados).toEqual(['ip-do-roteador']);
  });

  it('entrada 100% inválida devolve lista null (sem cerco) E o descarte', () => {
    const r = sanitizarIps('o wifi da igreja');
    expect(r.lista).toBe(null);
    expect(r.descartados.length).toBeGreaterThan(0);
  });

  it('máscara fora de 0-32 é descartada', () => {
    expect(sanitizarIps('191.0.2.0/33').lista).toBe(null);
  });
});

describe('alfabeto do código de pareamento', () => {
  // O voluntário lê da tela de um admin e digita num monitor touch: cada
  // caractere ambíguo é um chamado de suporte no domingo.
  it('não tem caractere visualmente ambíguo', () => {
    for (const c of ['O', '0', 'I', '1', 'l']) expect(ALFABETO.includes(c)).toBe(false);
  });

  it('não tem repetido e tem tamanho potência de 2 (amostragem sem viés)', () => {
    expect(new Set(ALFABETO.split('')).size).toBe(ALFABETO.length);
    expect(256 % ALFABETO.length).toBe(0);
  });

  it('8 caracteres · espaço grande o suficiente pra janela de 15 min', () => {
    expect(CODIGO_LEN).toBe(8);
    expect(ALFABETO.length ** CODIGO_LEN).toBeGreaterThan(1e12);
  });
});
