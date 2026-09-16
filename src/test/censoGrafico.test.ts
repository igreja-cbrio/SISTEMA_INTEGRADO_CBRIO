// A régua do que VIRA GRÁFICO no censo — e do que não vira, mas é declarado.
//
// ⚠️⚠️ Este arquivo existe por causa de um vazamento medido em 13/09/2026: o
// endpoint /censo/perfil (nível 1) truncava em 1.000 linhas e, por acaso, o
// corte alfabético deixava `nascimento` (tipo `data`, 774 valores distintos)
// de fora. Consertar só o truncamento entregaria 774 datas de nascimento
// nominais como barras. Se algum destes casos ficar vermelho, o conserto do
// bug virou o vazamento.
import { describe, it, expect } from 'vitest';
import {
  classificar, aplicarTeto, cortarDemografia, SEM_DADO_DEMOGRAFIA,
  TIPOS_PARA_BUSCAR, TIPOS_IDENTIFICACAO, TETO_VALORES,
} from '../../backend/utils/censoGrafico.js';

describe('o que vira gráfico', () => {
  it('opção, escala, sim/não e número viram barra', () => {
    for (const t of ['opcao_unica', 'multipla', 'sim_nao', 'escala_5', 'estrelas_5', 'nps', 'numero']) {
      expect(classificar(t)).toBe('grafico');
    }
  });

  it('⚠️ nascimento (data) e texto_curto são IDENTIFICAÇÃO, nunca gráfico', () => {
    // É o caso do vazamento: `data` não estava em nenhuma lista de exclusão do
    // handler antigo e cairia no ramo padrão, virando uma barra por pessoa.
    expect(classificar('data')).toBe('identificacao');
    expect(classificar('texto_curto')).toBe('identificacao');
    expect(TIPOS_IDENTIFICACAO).toContain('data');
  });

  it('⚠️ identificação NUNCA é pedida ao banco', () => {
    // A defesa é em duas camadas: além de não desenhar, o valor não é lido.
    for (const t of TIPOS_IDENTIFICACAO) expect(TIPOS_PARA_BUSCAR).not.toContain(t);
    expect(TIPOS_PARA_BUSCAR).not.toContain('texto_longo');
  });

  it('⚠️ tipo desconhecido NÃO vira gráfico (whitelist, nunca blacklist)', () => {
    // Blacklist erraria para o lado de publicar: tipo novo no construtor
    // nasceria desenhado sem ninguém ter decidido.
    expect(classificar('cpf_mascarado')).toBe('desconhecido');
    expect(classificar('')).toBe('desconhecido');
    expect(TIPOS_PARA_BUSCAR).not.toContain('cpf_mascarado');
  });

  it('texto livre vai para a Leitura da IA, lista longa vira barra com teto', () => {
    expect(classificar('texto_longo')).toBe('texto');
    expect(classificar('busca')).toBe('lista_longa');
    expect(TIPOS_PARA_BUSCAR).toContain('busca');
  });

  it('seção continua sendo cabeçalho', () => {
    expect(classificar('secao')).toBe('secao');
  });
});

describe('teto de valores por pergunta', () => {
  const muitos = (n: number) => [...Array(n)].map((_, i) => ({ valor: `v${i}`, total: n - i, neutra: false }));

  it('lista curta passa inteira', () => {
    const r = aplicarTeto(muitos(5));
    expect(r.valores).toHaveLength(5);
    expect(r.ocultos).toBe(0);
  });

  it('⚠️ o que passa do teto é DECLARADO, com quantas pessoas representa', () => {
    // `igreja_anterior_nome` tem 177 valores digitados à mão. Cortar em silêncio
    // esconderia gente justamente na pergunta que o conserto revelou.
    const r = aplicarTeto(muitos(30));
    expect(r.valores).toHaveLength(TETO_VALORES);
    expect(r.ocultos).toBe(10);
    expect(r.ocultosTotal).toBeGreaterThan(0);
  });

  it('⚠️ a NEUTRA nunca é cortada, mesmo sendo a última', () => {
    // "Prefiro não dizer" é o que explica a base; sem ela o percentual parece
    // errado e ninguém sabe por quê.
    const com = [...muitos(30), { valor: 'Prefiro não dizer', total: 1, neutra: true }];
    const r = aplicarTeto(com);
    expect(r.valores.some((v) => v.neutra)).toBe(true);
  });

  it('lista vazia não quebra', () => {
    expect(aplicarTeto([]).valores).toEqual([]);
    expect(aplicarTeto(undefined as never).valores).toEqual([]);
  });
});

// ⚠️⚠️ Achado do Marcos em 16/09/2026: "o campo de bairro somando todos os nomes
// dá bem menos que 960 respostas". Dava mesmo — o corte de bairro fazia um
// `slice(0, 12)` cru e escondia 205 pessoas em 108 bairros de 973 respondentes,
// 21%, sem nada na tela. Se algum destes casos ficar vermelho, a soma das barras
// voltou a não fechar com o total de respondentes.
describe('corte demográfico declara o que o teto escondeu', () => {
  // A distribuição REAL de bairro medida em 16/09 (a cauda comprimida).
  const bairrosReais = {
    'Barra da Tijuca': 274, 'Recreio dos Bandeirantes': 145, 'Barra Olímpica': 125,
    'Freguesia (Jacarepaguá)': 60, 'Jacarepaguá': 48, 'Pechincha': 33, 'Taquara': 19,
    'Tijuca': 17, 'Realengo': 15, 'Centro': 13, 'Vargem Pequena': 11, 'Vargem Grande': 8,
    'Curicica': 8, 'Copacabana': 8, 'Campo Grande': 8, 'Anil': 7,
    '(não informado)': 7, 'Vila Isabel': 6, 'Bangu': 5, 'Tanque': 5,
  };
  const totalReal = Object.values(bairrosReais).reduce((s, n) => s + n, 0);

  it('visíveis + escondidos FECHAM com o total de pessoas', () => {
    const r = cortarDemografia(bairrosReais, 12);
    const soma = r.valores.reduce((s, v) => s + v.total, 0);
    expect(soma + r.ocultos_pessoas).toBe(totalReal);
  });

  it('declara quantos valores e quantas PESSOAS ficaram de fora', () => {
    const r = cortarDemografia(bairrosReais, 12);
    expect(r.ocultos).toBeGreaterThan(0);
    expect(r.ocultos_pessoas).toBeGreaterThan(0);
  });

  it('"(não informado)" NUNCA é cortado, mesmo caindo na cauda', () => {
    // Na distribuição real ele tem 7 pessoas e ficaria fora do top 12.
    const r = cortarDemografia(bairrosReais, 12);
    expect(r.valores.some((v) => v.valor === SEM_DADO_DEMOGRAFIA)).toBe(true);
    // e ele não consome uma das 12 vagas dos bairros de verdade
    expect(r.valores.filter((v) => v.valor !== SEM_DADO_DEMOGRAFIA)).toHaveLength(12);
  });

  it('sem estourar o teto, não esconde nada', () => {
    const r = cortarDemografia({ a: 3, b: 2, c: 1 }, 12);
    expect(r.ocultos).toBe(0);
    expect(r.ocultos_pessoas).toBe(0);
    expect(r.valores).toHaveLength(3);
  });

  it('ordena do maior para o menor', () => {
    const r = cortarDemografia({ a: 1, b: 9, c: 5 }, 12);
    expect(r.valores.map((v) => v.valor)).toEqual(['b', 'c', 'a']);
  });

  it('entrada vazia não quebra', () => {
    expect(cortarDemografia({}, 12).valores).toEqual([]);
    expect(cortarDemografia(undefined as never, 12).valores).toEqual([]);
  });
});
