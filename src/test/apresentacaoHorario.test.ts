// Régua do horário da apresentação de crianças (08/09/2026): o sistema atribui
// o 1º horário aberto com vaga na ordem do catálogo (9h30 até o limite, depois
// 11h30). Sem catálogo ⇒ null (a inscrição entra sem horário, o Kids corrige).
// E a guarda dos pais: "Aline Lazaro / Aline Lazaro" é UMA pessoa.
import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend (padrão do cultoApresentacao.test.ts)
import {
  escolherHorarioApresentacao, rotuloHorarioApresentacao, paisIguais, nomesDosPaisUnicos,
} from '../../backend/utils/apresentacaoHorario';
import * as front from '../lib/apresentacaoPais';

const catalogo = [
  { horario: '09:30', label: 'Culto das 9h30', aberto: true, limite: 6, ordem: 1 },
  { horario: '11:30', label: 'Culto das 11h30', aberto: true, limite: null, ordem: 2 },
];

describe('escolherHorarioApresentacao', () => {
  it('vazio ⇒ 9h30 (primário)', () => {
    const r = escolherHorarioApresentacao(catalogo, {});
    expect(r.horario).toBe('09:30');
    expect(r.label).toBe('Culto das 9h30');
    expect(r.transbordou).toBe(false);
  });

  it('com 5 no 9h30 ainda cabe (a 6ª inscrição fica no 9h30)', () => {
    expect(escolherHorarioApresentacao(catalogo, { '09:30': 5 }).horario).toBe('09:30');
  });

  // ⚠️ MUTANTE: trocar `>=` por `>` deixaria a 7ª criança no 9h30.
  it('com 6 no 9h30 (limite atingido) transborda pro 11h30', () => {
    const r = escolherHorarioApresentacao(catalogo, { '09:30': 6 });
    expect(r.horario).toBe('11:30');
    expect(r.transbordou).toBe(true);
  });

  // ⚠️ MUTANTE: tratar limite nulo como 0 mandaria todo mundo pra "lotado".
  it('limite nulo nunca lota, mesmo com contagem alta', () => {
    const r = escolherHorarioApresentacao(catalogo, { '09:30': 6, '11:30': 999 });
    expect(r.horario).toBe('11:30');
    expect(r.lotado).toBe(false);
  });

  it('horário fechado é pulado mesmo com vaga', () => {
    const cat = [{ ...catalogo[0], aberto: false }, catalogo[1]];
    expect(escolherHorarioApresentacao(cat, {}).horario).toBe('11:30');
  });

  it('todos lotados ⇒ null + lotado=true (a equipe precisa agir; a inscrição NÃO se perde)', () => {
    const cat = [catalogo[0], { ...catalogo[1], limite: 6 }];
    const r = escolherHorarioApresentacao(cat, { '09:30': 6, '11:30': 6 });
    expect(r.horario).toBeNull();
    expect(r.lotado).toBe(true);
  });

  it('respeita a ORDEM do catálogo, não a ordem da lista', () => {
    const invertido = [catalogo[1], catalogo[0]];
    expect(escolherHorarioApresentacao(invertido, {}).horario).toBe('09:30');
  });

  it('catálogo nulo/vazio ⇒ null sem quebrar (falha fechada: entra sem horário)', () => {
    expect(escolherHorarioApresentacao(null as any, {}).horario).toBeNull();
    expect(escolherHorarioApresentacao([], {}).horario).toBeNull();
    expect(escolherHorarioApresentacao(undefined as any).horario).toBeNull();
  });

  it('ocupação em Map também funciona', () => {
    expect(escolherHorarioApresentacao(catalogo, new Map([['09:30', 6]])).horario).toBe('11:30');
  });

  it('limite 0 lota sempre (é diferente de nulo)', () => {
    const cat = [{ ...catalogo[0], limite: 0 }, catalogo[1]];
    expect(escolherHorarioApresentacao(cat, {}).horario).toBe('11:30');
  });
});

describe('rotuloHorarioApresentacao', () => {
  it('usa o label do catálogo quando há', () => {
    expect(rotuloHorarioApresentacao('09:30', catalogo)).toBe('Culto das 9h30');
  });
  it('sem catálogo cai no formato da igreja', () => {
    expect(rotuloHorarioApresentacao('11:30')).toBe('11h30');
  });
  it('sem horário devolve null (omite, nunca inventa)', () => {
    expect(rotuloHorarioApresentacao(null, catalogo)).toBeNull();
    expect(rotuloHorarioApresentacao('', catalogo)).toBeNull();
  });
});

describe('paisIguais · o caso Isabella', () => {
  it('"Aline Lazaro" / "Aline Lazaro" é a mesma pessoa', () => {
    expect(paisIguais('Aline Lazaro', 'Aline Lazaro')).toBe(true);
  });
  it('tolera caixa, acento e espaço duplo', () => {
    expect(paisIguais('aline  lázaro', 'Aline Lazaro')).toBe(true);
  });
  it('nomes diferentes não são iguais', () => {
    expect(paisIguais('Carlos Pestana', 'Aline Lazaro')).toBe(false);
  });
  it('vazio nunca é "igual" (um só preenchido é o caso normal)', () => {
    expect(paisIguais('', 'Aline Lazaro')).toBe(false);
    expect(paisIguais(null, null)).toBe(false);
  });
});

describe('nomesDosPaisUnicos', () => {
  it('linha antiga dobrada sai UMA vez (o certificado deixa de dobrar)', () => {
    expect(nomesDosPaisUnicos('Aline Lazaro', 'Aline Lazaro')).toEqual(['Aline Lazaro']);
  });
  it('pai e mãe distintos saem os dois, pai primeiro', () => {
    expect(nomesDosPaisUnicos('Carlos Pestana', 'Aline Lazaro')).toEqual(['Carlos Pestana', 'Aline Lazaro']);
  });
  it('só um preenchido', () => {
    expect(nomesDosPaisUnicos(null, 'Aline Lazaro')).toEqual(['Aline Lazaro']);
    expect(nomesDosPaisUnicos('', '')).toEqual([]);
  });
});

// ⚠️ O front tem espelho em `src/lib/apresentacaoPais.ts` (lista do Kids,
// certificado e validação do form). Divergir faria a porta recusar o que a tela
// aceita — ou a tela dobrar o que a porta já recusa.
describe('espelho front × backend (apresentacaoPais)', () => {
  const casos: Array<[unknown, unknown]> = [
    ['Aline Lazaro', 'Aline Lazaro'], ['aline  lázaro', 'Aline Lazaro'], ['Carlos Pestana', 'Aline Lazaro'],
    ['', 'Aline Lazaro'], [null, null], ['  Ana  Maria ', 'ana maria'],
  ];
  it('paisIguais concorda em todos os casos', () => {
    for (const [a, b] of casos) expect(front.paisIguais(a, b)).toBe(paisIguais(a, b));
  });
  it('nomesDosPaisUnicos concorda em todos os casos', () => {
    for (const [a, b] of casos) expect(front.nomesDosPaisUnicos(a, b)).toEqual(nomesDosPaisUnicos(a, b));
  });
});
