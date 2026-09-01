// A régua do campo de bairro · o que a tela mostra e o que o banco grava têm
// que concordar.
//
// ⚠️⚠️ O QUE ESTES TESTES PROTEGEM, em uma frase: o formulário público
// FABRICAVA duas grafias para o mesmo bairro. Ele tinha uma lista de 11
// APELIDOS CURTOS ('Barra', 'Recreio', 'Freguesia') e o ViaCEP devolve o nome
// OFICIAL ('Barra da Tijuca', 'Recreio dos Bandeirantes', 'Freguesia
// (Jacarepaguá)'); a comparação normalizada nunca casava, então quem escolhia
// da lista gravava o curto e quem preenchia o CEP gravava o longo.
// Medido em produção (23/08/2026), em mem_membros vivos:
//   Barra da Tijuca 33 × Barra 22 · Recreio 15 × 14 · Freguesia 5 × 4.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { normalizarBairro, avaliarBairro, sugerirBairros, type BairroCatalogo } from '../lib/bairros';

const require_ = createRequire(import.meta.url);
const geoBrasil = require_('../../backend/services/geoBrasil.js');

/** Recorte do catálogo REAL de produção (24/08/2026), com as contagens reais. */
const CATALOGO: BairroCatalogo[] = [
  { norm: 'barra da tijuca', nome: 'Barra da Tijuca', pessoas: 55, apelidos: ['barra'] },
  // ⚠️ 'recreio bandeirantes' (sem o "dos") é apelido SINTÉTICO, e está aqui de
  // propósito: os três apelidos vivos hoje ('barra', 'recreio', 'freguesia')
  // são todos PREFIXO do nome oficial, então casam pelo ramo de prefixo e o
  // casamento por apelido nunca é exercitado. Sem um apelido não-prefixo, um
  // mutante que apaga esse ramo passa despercebido — foi o que aconteceu.
  { norm: 'recreio dos bandeirantes', nome: 'Recreio dos Bandeirantes', pessoas: 29, apelidos: ['recreio', 'recreio bandeirantes'] },
  { norm: 'barra olimpica', nome: 'Barra Olímpica', pessoas: 20, apelidos: [] },
  { norm: 'freguesia (jacarepagua)', nome: 'Freguesia (Jacarepaguá)', pessoas: 9, apelidos: ['freguesia'] },
  { norm: 'taquara', nome: 'Taquara', pessoas: 7, apelidos: [] },
  { norm: 'vargem pequena', nome: 'Vargem Pequena', pessoas: 5, apelidos: [] },
  { norm: 'vargem grande', nome: 'Vargem Grande', pessoas: 3, apelidos: [] },
  { norm: 'vila valqueire', nome: 'Vila Valqueire', pessoas: 1, apelidos: [] },
];

describe('normalizarBairro · o MESMO resultado no front e no backend', () => {
  // Os dois são espelhos de nullif(f_unaccent(lower(trim(x))),'') no SQL.
  // ⚠️ Divergir aqui faz a tela dizer "reconheci este bairro" e o banco gravar
  // outra chave — o defeito exato que esta leva conserta, só que invertido.
  const casos = [
    'Barra da Tijuca', '  Copacabana  ', 'São Conrado', 'Jacarepaguá',
    'Freguesia (Jacarepaguá)', 'MARECHAL HERMES', 'Água Santa', 'Praça Seca',
    'Vila Isabel / Grajaú', 'Niterói - Icaraí', 'Penha Circular 2',
  ];
  for (const c of casos) {
    it(`front e backend concordam em ${JSON.stringify(c)}`, () => {
      expect(normalizarBairro(c)).toBe(geoBrasil.normalizarBairro(c));
    });
  }

  it('vazio: o front devolve string vazia, o backend null — e os dois são falsy', () => {
    // Diferença consciente de tipo: o front usa o retorno em comparação de
    // string, o backend em chave de banco. O que não pode divergir é a
    // DECISÃO ("não há bairro"), e ela é a mesma.
    expect(normalizarBairro('   ')).toBe('');
    expect(geoBrasil.normalizarBairro('   ')).toBeNull();
    expect(Boolean(normalizarBairro('   '))).toBe(Boolean(geoBrasil.normalizarBairro('   ')));
  });
});

describe('avaliarBairro · o que o texto significa', () => {
  it('nome oficial é reconhecido', () => {
    const r = avaliarBairro('Barra da Tijuca', CATALOGO);
    expect(r.tipo).toBe('conhecido');
  });

  it('acento, caixa e espaço não atrapalham', () => {
    expect(avaliarBairro('  freguesia (JACAREPAGUA) ', CATALOGO).tipo).toBe('conhecido');
  });

  it('⚠️ APELIDO é reconhecido e aponta para o canônico', () => {
    // Este é o caso central: sem ele, quem digita "Barra" cria a variação de
    // grafia de novo.
    const r = avaliarBairro('Barra', CATALOGO);
    expect(r.tipo).toBe('apelido');
    if (r.tipo === 'apelido') expect(r.bairro.nome).toBe('Barra da Tijuca');
  });

  it('⚠️ bairro fora do catálogo é "novo", NUNCA erro', () => {
    // Travar aqui impediria de se cadastrar quem mora onde a base ainda não
    // viu — numa porta pública, o pior desfecho possível.
    const r = avaliarBairro('Copacabana', CATALOGO);
    expect(r.tipo).toBe('novo');
    if (r.tipo === 'novo') expect(r.digitado).toBe('Copacabana');
  });

  it('vazio não diz nada', () => {
    expect(avaliarBairro('', CATALOGO).tipo).toBe('vazio');
    expect(avaliarBairro('   ', CATALOGO).tipo).toBe('vazio');
  });

  it('⚠️ "Barra Olímpica" é lugar PRÓPRIO, não apelido da Barra', () => {
    // Ele é agrupado no mapa dentro da Barra da Tijuca, mas continua sendo
    // onde a pessoa mora. Tratá-lo como apelido apagaria isso.
    const r = avaliarBairro('Barra Olímpica', CATALOGO);
    expect(r.tipo).toBe('conhecido');
    if (r.tipo === 'conhecido') expect(r.bairro.nome).toBe('Barra Olímpica');
  });
});

describe('sugerirBairros · o que aparece na lista', () => {
  it('sem texto, os bairros com mais gente vêm primeiro', () => {
    // No totem o preenchimento é em pé, com fila atrás: a região tem que estar
    // no topo sem ninguém digitar.
    const r = sugerirBairros('', CATALOGO, 3).map((b) => b.nome);
    expect(r).toEqual(['Barra da Tijuca', 'Recreio dos Bandeirantes', 'Barra Olímpica']);
  });

  it('⚠️ digitar o APELIDO acha o bairro oficial', () => {
    // Sem isto a pessoa digita o apelido, não vê nada, e escreve o apelido —
    // recriando a duplicidade que o catálogo existe para eliminar.
    expect(sugerirBairros('recreio', CATALOGO).map((b) => b.nome))
      .toContain('Recreio dos Bandeirantes');
  });

  it('⚠️ apelido que NÃO é prefixo também acha — é o ramo que só ele exercita', () => {
    // "recreio bandeirantes" não começa nem contém "recreio dos bandeirantes":
    // se o casamento por apelido sumir, esta é a única asserção que fica
    // vermelha.
    expect(sugerirBairros('recreio bandeirantes', CATALOGO).map((b) => b.nome))
      .toContain('Recreio dos Bandeirantes');
  });

  it('começo do nome vem antes de meio do nome', () => {
    const r = sugerirBairros('vargem', CATALOGO).map((b) => b.nome);
    expect(r[0]).toBe('Vargem Pequena');   // 5 pessoas
    expect(r[1]).toBe('Vargem Grande');    // 3 pessoas
  });

  it('acento no que a pessoa digita não impede o acerto', () => {
    expect(sugerirBairros('olímpica', CATALOGO).map((b) => b.nome)).toContain('Barra Olímpica');
    expect(sugerirBairros('olimpica', CATALOGO).map((b) => b.nome)).toContain('Barra Olímpica');
  });

  it('texto que não casa com nada devolve lista vazia, não o catálogo inteiro', () => {
    // Devolver tudo faria a lista parecer que aceitou o que a pessoa escreveu.
    expect(sugerirBairros('zzzzz', CATALOGO)).toEqual([]);
  });

  it('respeita o limite', () => {
    expect(sugerirBairros('', CATALOGO, 2)).toHaveLength(2);
  });
});
