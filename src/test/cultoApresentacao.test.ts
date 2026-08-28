// Régua do culto da apresentação de bebês (D3 · docs/cultos-domingo §12.1):
// 09:30 primário · overflow 11:30 por limite (bebês SEM limite por enquanto,
// decisão do Marcos 12/08) · pré-corte cai no 10:00 · SEM candidato ⇒ null,
// NUNCA "o culto mais cedo" (o fallback antigo penduraria a cerimônia no
// fantasma de 08:30 pós-corte — achado B9 da varredura de 11/08).
import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend (padrão do grupoEdicaoApp.test.ts)
import { escolherCultoApresentacao, rotuloHora } from '../../backend/utils/criancaApresentacao';

const culto = (id: string, hora: string) => ({ id, service_type: { recurrence_time: hora } });

// Grade ATUAL (até 23/08) e grade NOVA (a partir de 24/08), como vêm do banco
// (coluna time → 'HH:MM:SS').
const gradeAtual = [
  culto('c0830', '08:30:00'),
  culto('c1000', '10:00:00'),
  culto('c1130', '11:30:00'),
  culto('c1900', '19:00:00'),
];
const gradeNova = [
  culto('n0930', '09:30:00'),
  culto('n1130', '11:30:00'),
  culto('n1900', '19:00:00'),
];

describe('escolherCultoApresentacao', () => {
  it('grade atual (sem 09:30) cai no 10:00 — comportamento vigente preservado', () => {
    const r = escolherCultoApresentacao(gradeAtual);
    expect(r.culto?.id).toBe('c1000');
    expect(r.hora).toBe('10:00');
    expect(r.transbordou).toBe(false);
  });

  it('grade nova: 09:30 é o primário', () => {
    const r = escolherCultoApresentacao(gradeNova);
    expect(r.culto?.id).toBe('n0930');
    expect(r.hora).toBe('09:30');
  });

  it('com 09:30 E 10:00 presentes, o 09:30 vence', () => {
    const r = escolherCultoApresentacao([...gradeAtual, culto('n0930', '09:30:00')]);
    expect(r.culto?.id).toBe('n0930');
  });

  // ⚠️ MUTANTE (B9): reintroduzir o fallback "mais cedo do dia" deixa este
  // teste vermelho — é ele que impede a cerimônia de cair no fantasma 08:30.
  it('sem 09:30 nem 10:00 devolve null — NUNCA o culto mais cedo', () => {
    const r = escolherCultoApresentacao([culto('c0830', '08:30:00'), culto('c1900', '19:00:00')]);
    expect(r.culto).toBeNull();
    expect(r.hora).toBeNull();
  });

  it('lista vazia/nula devolve null sem quebrar', () => {
    expect(escolherCultoApresentacao([]).culto).toBeNull();
    expect(escolherCultoApresentacao(undefined as any).culto).toBeNull();
  });

  // ⚠️ MUTANTE (regra do "sem limite"): tratar limite nulo como 0 mandaria
  // TODO MUNDO pro 11:30 — bebês sem limite = sempre primário.
  it('limite nulo NUNCA transborda, mesmo com contagem alta', () => {
    const r = escolherCultoApresentacao(gradeNova, { limite: null, contagem: { n0930: 999 } });
    expect(r.culto?.id).toBe('n0930');
    expect(r.transbordou).toBe(false);
  });

  it('com limite atingido no 09:30, transborda pro 11:30', () => {
    const r = escolherCultoApresentacao(gradeNova, { limite: 8, contagem: { n0930: 8 } });
    expect(r.culto?.id).toBe('n1130');
    expect(r.hora).toBe('11:30');
    expect(r.transbordou).toBe(true);
  });

  it('abaixo do limite fica no primário', () => {
    const r = escolherCultoApresentacao(gradeNova, { limite: 8, contagem: { n0930: 7 } });
    expect(r.culto?.id).toBe('n0930');
  });

  it('contagem em Map também funciona', () => {
    const r = escolherCultoApresentacao(gradeNova, { limite: 2, contagem: new Map([['n0930', 2]]) });
    expect(r.culto?.id).toBe('n1130');
  });

  it('pré-corte com limite atingido no 10:00 transborda pro 11:30', () => {
    const r = escolherCultoApresentacao(gradeAtual, { limite: 8, contagem: { c1000: 8 } });
    expect(r.culto?.id).toBe('c1130');
    expect(r.transbordou).toBe(true);
  });

  it('09:30 e 11:30 ambos lotados devolve null (não força vaga)', () => {
    const r = escolherCultoApresentacao(gradeNova, { limite: 1, contagem: { n0930: 1, n1130: 1 } });
    expect(r.culto).toBeNull();
  });
});

describe('rotuloHora', () => {
  it('formata como a igreja fala', () => {
    expect(rotuloHora('09:30')).toBe('9h30');
    expect(rotuloHora('09:30:00')).toBe('9h30');
    expect(rotuloHora('10:00')).toBe('10h');
    expect(rotuloHora('11:30:00')).toBe('11h30');
  });

  it('sem hora devolve null (o texto é omitido, nunca inventado)', () => {
    expect(rotuloHora(null)).toBeNull();
    expect(rotuloHora('')).toBeNull();
    expect(rotuloHora('abc')).toBeNull();
  });
});
