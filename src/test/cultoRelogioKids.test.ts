// Régua do "culto de AGORA" do totem Kids (src/lib/cultoRelogioKids.ts) —
// extraída do TotemKidsCheckin.tsx pro Lote 2 da mudança dos cultos de domingo
// (corte 24/08/2026 · docs/cultos-domingo/). O 'agora' é INJETADO (teste que lê
// o relógio da máquina foi o que mordeu no faixaEtaria.test.ts).
//
// O que está travado aqui:
// 1. Grade ATUAL (08:30/10:00/11:30/19:00): comportamento byte-idêntico ao que
//    está em produção — é o que permite este código ir ao ar ANTES do corte.
// 2. Grade NOVA (09:30/11:30/19:00): buraco ZERO entre cultos do MESMO período
//    (10:30–11:00 sem a regra ficava sem culto de agora) — MUTATION-TESTADO
//    nos dois sentidos: esticar o _fim do anterior (criança das 10:45 cairia no
//    09:30 que JÁ ACABOU) e fechar buraco entre PERÍODOS (19:00 abriria 12:30).
import { describe, it, expect } from 'vitest';
import { escolherCultoPorRelogio, horaMin, periodoKey } from '../lib/cultoRelogioKids';

const m = (h: string) => horaMin(h);

// Grade ATUAL de domingo (até 23/08/2026)
const GRADE_ATUAL = [
  { id: '0830', hora: '08:30' },
  { id: '1000', hora: '10:00' },
  { id: '1130', hora: '11:30' },
  { id: '1900', hora: '19:00' },
];
// Grade NOVA de domingo (a partir de 30/08/2026)
const GRADE_NOVA = [
  { id: '0930', hora: '09:30' },
  { id: '1130', hora: '11:30' },
  { id: '1900', hora: '19:00' },
];

describe('escolherCultoPorRelogio · grade ATUAL (comportamento preservado)', () => {
  it('07:40 (antecedência de 30 min) → 08:30', () => {
    expect(escolherCultoPorRelogio(GRADE_ATUAL, m('07:40')).atual?.id).toBe('0830');
  });
  it('06:00 (antes de tudo) → 1º culto (early birds)', () => {
    expect(escolherCultoPorRelogio(GRADE_ATUAL, m('06:00')).atual?.id).toBe('0830');
  });
  it('09:45 → 10:00 (o 08:30 fechou quando o próximo abriu)', () => {
    expect(escolherCultoPorRelogio(GRADE_ATUAL, m('09:45')).atual?.id).toBe('1000');
  });
  it('10:35 → ainda 10:00 (fecha só quando o 11:30 abre, às 11:00)', () => {
    expect(escolherCultoPorRelogio(GRADE_ATUAL, m('10:35')).atual?.id).toBe('1000');
  });
  it('12:35 → NENHUM (tarde de domingo segue sem culto de agora)', () => {
    expect(escolherCultoPorRelogio(GRADE_ATUAL, m('12:35')).atual).toBeNull();
  });
  it('18:10 (antecedência de 60 min do ÚLTIMO) → 19:00', () => {
    expect(escolherCultoPorRelogio(GRADE_ATUAL, m('18:10')).atual?.id).toBe('1900');
  });
  it('23:30 → nenhum culto (todos acabaram · visiveis vazio)', () => {
    const r = escolherCultoPorRelogio(GRADE_ATUAL, m('23:30'));
    expect(r.atual).toBeNull();
    expect(r.visiveis).toHaveLength(0);
  });
});

describe('escolherCultoPorRelogio · grade NOVA (buraco zero · corte 24/08)', () => {
  it('10:20 → 09:30 (janela do 09:30 vai até 10:30)', () => {
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('10:20')).atual?.id).toBe('0930');
  });
  it('10:45 (o BURACO 10:30–11:00) → 11:30, nunca sem culto', () => {
    // MUTANTE 1: remover a regra do buraco zero deixa atual=null aqui.
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('10:45')).atual?.id).toBe('1130');
  });
  it('10:45 NÃO cai no 09:30 (o _fim do anterior não estica — o culto acabou)', () => {
    // MUTANTE 2: fechar o buraco esticando o _fim do ANTERIOR (em vez da
    // antecedência do próximo) devolveria '0930' — criança iria pro culto que
    // já acabou.
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('10:45')).atual?.id).not.toBe('0930');
  });
  it('13:00 → NENHUM: o buraco entre PERÍODOS (manhã → noite) é intencional', () => {
    // MUTANTE 3: fechar todo buraco (sem a condição de mesmo período) faria o
    // 19:00 abrir às 12:30.
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('13:00')).atual).toBeNull();
  });
  it('08:50 (antecedência) → 09:30 · 11:05 → 11:30 · 19:30 → 19:00', () => {
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('08:50')).atual?.id).toBe('0930');
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('11:05')).atual?.id).toBe('1130');
    expect(escolherCultoPorRelogio(GRADE_NOVA, m('19:30')).atual?.id).toBe('1900');
  });
});

describe('escolherCultoPorRelogio · casos gerais', () => {
  it('lista vazia / sem hora → sem culto', () => {
    expect(escolherCultoPorRelogio([], m('10:00')).atual).toBeNull();
    expect(escolherCultoPorRelogio([{ id: 'x' }], m('10:00')).atual).toBeNull();
  });
  it('culto único (Quarta 20:00) → janela 19:00–23:00', () => {
    const quarta = [{ id: 'qua', hora: '20:00' }];
    expect(escolherCultoPorRelogio(quarta, m('19:10')).atual?.id).toBe('qua');
    expect(escolherCultoPorRelogio(quarta, m('21:30')).atual?.id).toBe('qua');
    expect(escolherCultoPorRelogio(quarta, m('23:10')).atual).toBeNull();
  });
  it('é determinística no mesmo agora (função pura)', () => {
    const a = escolherCultoPorRelogio(GRADE_NOVA, m('10:45'));
    const b = escolherCultoPorRelogio(GRADE_NOVA, m('10:45'));
    expect(a.atual?.id).toBe(b.atual?.id);
    expect(a.visiveis.map((c: any) => c.id)).toEqual(b.visiveis.map((c: any) => c.id));
  });
});

describe('periodoKey (é ela que decide onde o buraco fecha)', () => {
  it('09:30 e 11:30 são o MESMO período (manhã) · 19:00 é noite', () => {
    expect(periodoKey('09:30')).toBe('manha');
    expect(periodoKey('11:30')).toBe('manha');
    expect(periodoKey('19:00')).toBe('noite');
    expect(periodoKey('14:00')).toBe('tarde');
  });
});
