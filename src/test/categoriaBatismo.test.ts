// Contrato das faixas etárias do BATIZANDO (definidas pelo Matheus · 19/08/2026).
//
// A régua decide o que aparece como tag na ficha e o que o filtro devolve, e o
// erro caro dela é o LIMIAR: quem faz 13 anos hoje deixa de ser criança, e um
// dia de diferença muda a categoria. Por isso os casos abaixo são as bordas
// exatas que ele escreveu — "12 anos, 11 meses e 29 dias" de um lado, o
// aniversário do outro.
//
// ⚠️ `agora` é INJETADO em todos os casos: régua de idade que lê o relógio da
// máquina passa hoje e falha no aniversário seguinte (a lição do
// faixaEtaria.test.ts).
import { describe, it, expect } from 'vitest';
import {
  categoriaBatismo, categoriaPorIdade, CATEGORIAS, CATEGORIA_LABEL_FAIXA,
} from '../lib/categoriaBatismo';

const HOJE = new Date('2026-08-19T12:00:00');
const cat = (nascimento: string | null, extra: Record<string, unknown> = {}) =>
  categoriaBatismo({ data_nascimento: nascimento, ...extra }, HOJE);

describe('as quatro faixas', () => {
  it('criança vai até 12 anos, 11 meses e 29 dias', () => {
    expect(cat('2026-08-19')).toBe('crianca');   // recém-nascido
    expect(cat('2014-08-19')).toBe('crianca');   // 12 anos exatos
    expect(cat('2013-08-20')).toBe('crianca');   // 12a 11m 30d — véspera do 13º
  });

  it('adolescente começa NO 13º aniversário e vai até 17a 11m 29d', () => {
    expect(cat('2013-08-19')).toBe('adolescente'); // faz 13 hoje
    expect(cat('2009-08-19')).toBe('adolescente'); // 17 exatos
    expect(cat('2008-08-20')).toBe('adolescente'); // véspera do 18º
  });

  it('jovem começa NO 18º e vai até 25a 11m 29d', () => {
    expect(cat('2008-08-19')).toBe('jovem');  // faz 18 hoje
    expect(cat('2001-08-19')).toBe('jovem');  // 25 exatos
    expect(cat('2000-08-20')).toBe('jovem');  // véspera do 26º
  });

  it('adulto é 26 em diante', () => {
    expect(cat('2000-08-19')).toBe('adulto'); // faz 26 hoje
    expect(cat('1975-03-02')).toBe('adulto');
  });
});

describe('quem manda quando há mais de um sinal', () => {
  it('⚠️ eh_crianca vence a data — é declaração de quem cadastrou', () => {
    // Caso real na base: Enzo, 13 anos, marcado como criança no cadastro.
    expect(cat('2013-07-26', { eh_crianca: true })).toBe('crianca');
  });

  it('a DATA vence a categoria gravada — a pessoa envelhece, a coluna não', () => {
    // Gravado como jovem quando tinha 25; hoje tem 26 e a tag tem que virar.
    expect(cat('2000-01-10', { categoria_etaria: 'jovem' })).toBe('adulto');
  });

  it('sem data, vale a categoria gravada', () => {
    expect(cat(null, { categoria_etaria: 'adolescente' })).toBe('adolescente');
  });

  it('sem data e sem categoria gravada, não inventa', () => {
    expect(cat(null)).toBeNull();
    expect(cat(null, { categoria_etaria: 'qualquer_coisa' })).toBeNull();
  });
});

describe('data ruim não vira categoria', () => {
  it('data ilegível ou absurda devolve null', () => {
    expect(cat('')).toBeNull();
    expect(cat('ontem')).toBeNull();
    // Caso real na base: nascimento gravado como 1085-04-20 (941 anos).
    expect(cat('1085-04-20')).toBeNull();
  });

  it('data no futuro não vira criança', () => {
    expect(cat('2027-01-01')).toBeNull();
  });
});

describe('catálogo', () => {
  it('tem as 4 faixas, com rótulo que declara o intervalo', () => {
    expect(CATEGORIAS).toEqual(['crianca', 'adolescente', 'jovem', 'adulto']);
    expect(CATEGORIA_LABEL_FAIXA.jovem).toBe('Jovem (18–25)');
    expect(CATEGORIA_LABEL_FAIXA.adulto).toBe('Adulto (26+)');
  });

  it('categoriaPorIdade cobre os cortes sem depender de data', () => {
    expect(categoriaPorIdade(12)).toBe('crianca');
    expect(categoriaPorIdade(13)).toBe('adolescente');
    expect(categoriaPorIdade(17)).toBe('adolescente');
    expect(categoriaPorIdade(18)).toBe('jovem');
    expect(categoriaPorIdade(25)).toBe('jovem');
    expect(categoriaPorIdade(26)).toBe('adulto');
    expect(categoriaPorIdade(null)).toBeNull();
  });
});
