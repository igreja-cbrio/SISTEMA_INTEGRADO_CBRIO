// Contrato do enquadramento do mapa de calor da Membresia.
//
// ⚠️ O que esta régua decide é a CÂMERA INICIAL, nunca o que é desenhado.
// Bairro fora do núcleo continua no mapa e a tela declara quantos são — a
// diferença entre "fora do quadro" e "escondido" é o que faz este recorte ser
// honesto. Se um dia alguém usar `nucleo` para FILTRAR os pontos desenhados,
// este arquivo é o lugar de reescrever a regra, não de ajustar o consumidor.
import { describe, it, expect } from 'vitest';
import { nucleoDoMapa, type PontoBairro as BairroMapa } from '@/lib/nucleoMapaBairros';

const b = (norm: string, total: number, lat = -22.9, lng = -43.3): BairroMapa => ({
  norm, bairro: norm, total, lat, lng,
});

describe('nucleoDoMapa', () => {
  it('lista vazia devolve vazio dos dois lados', () => {
    const r = nucleoDoMapa([]);
    expect(r.nucleo).toEqual([]);
    expect(r.fora).toEqual([]);
  });

  it('com um bairro só, ele é o núcleo e nada fica de fora', () => {
    const r = nucleoDoMapa([b('barra', 55)]);
    expect(r.nucleo).toHaveLength(1);
    expect(r.fora).toHaveLength(0);
  });

  it('deixa fora do quadro o bairro distante de peso mínimo', () => {
    // Caso REAL medido em 23/08/2026: a Barra concentra 55 de 79 pessoas e um
    // único cadastro em Volta Redonda esticava o enquadramento até lá, jogando
    // o Rio inteiro para um canto da tela.
    const dados = [
      b('barra da tijuca', 55),
      b('freguesia', 7),
      b('jacarepagua', 4),
      b('centro', 2, -22.28, -42.53),
      b('jardim amalia', 1, -22.51, -44.07),
      b('copacabana', 1),
    ];
    const r = nucleoDoMapa(dados);
    const nomes = r.nucleo.map((x) => x.norm);
    expect(nomes).toContain('barra da tijuca');
    expect(r.fora.map((x) => x.norm)).toContain('jardim amalia');
    // ⚠️ Invariante: nada some. Núcleo + fora = tudo, sempre.
    expect(r.nucleo.length + r.fora.length).toBe(dados.length);
  });

  it('o núcleo cobre pelo menos a cobertura pedida', () => {
    const dados = [b('a', 50), b('b', 30), b('c', 15), b('d', 5)];
    const total = 100;
    const r = nucleoDoMapa(dados, 0.9);
    const somaNucleo = r.nucleo.reduce((s, x) => s + x.total, 0);
    expect(somaNucleo / total).toBeGreaterThanOrEqual(0.9);
  });

  it('distribuição plana mantém todo mundo no quadro', () => {
    // Sem concentração não há outlier a recortar: recortar aqui esconderia
    // bairro por acaso de ordenação.
    const dados = [b('a', 10), b('b', 10), b('c', 10), b('d', 10)];
    const r = nucleoDoMapa(dados, 0.9);
    expect(r.fora).toHaveLength(0);
  });

  it('total zero não recorta nada (evita divisão por zero silenciosa)', () => {
    const dados = [b('a', 0), b('b', 0)];
    const r = nucleoDoMapa(dados);
    expect(r.nucleo).toHaveLength(2);
    expect(r.fora).toHaveLength(0);
  });

  it('não altera a lista recebida', () => {
    const dados = [b('a', 1), b('b', 90)];
    const copia = dados.map((x) => x.norm).join('|');
    nucleoDoMapa(dados);
    expect(dados.map((x) => x.norm).join('|')).toBe(copia);
  });
});
