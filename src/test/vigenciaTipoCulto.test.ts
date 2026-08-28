import { describe, it, expect } from 'vitest';
import { tipoVigenteNoDia, filtrarVigentes } from '../../backend/utils/vigenciaTipoCulto';

// A grade real do CBRio na virada de 24/08/2026.
const OITO30  = { name: 'Domingo 08:30', is_active: true, vigente_de: null, vigente_ate: '2026-08-23' };
const NOVE30  = { name: 'Domingo 09:30', is_active: true, vigente_de: '2026-08-24', vigente_ate: null };
const DEZ     = { name: 'Domingo 10:00', is_active: true, vigente_de: null, vigente_ate: '2026-08-23' };
const ONZE30  = { name: 'Domingo 11:30', is_active: true, vigente_de: null, vigente_ate: null };
const GRADE   = [OITO30, NOVE30, DEZ, ONZE30];

describe('tipoVigenteNoDia', () => {
  it('⚠️ no domingo 23/08 a grade velha vale e o 09:30 ainda NÃO aparece', () => {
    expect(filtrarVigentes(GRADE, '2026-08-23').map(t => t.name))
      .toEqual(['Domingo 08:30', 'Domingo 10:00', 'Domingo 11:30']);
  });

  it('⚠️ no domingo 30/08 sobram só 09:30 e 11:30 — 08:30 e 10:00 encerraram', () => {
    expect(filtrarVigentes(GRADE, '2026-08-30').map(t => t.name))
      .toEqual(['Domingo 09:30', 'Domingo 11:30']);
  });

  it('a virada é no dia 24, inclusive dos dois lados', () => {
    // vigente_ate = 23 → o dia 23 ainda vale; vigente_de = 24 → o 24 já vale.
    expect(tipoVigenteNoDia(OITO30, '2026-08-23')).toBe(true);
    expect(tipoVigenteNoDia(OITO30, '2026-08-24')).toBe(false);
    expect(tipoVigenteNoDia(NOVE30, '2026-08-23')).toBe(false);
    expect(tipoVigenteNoDia(NOVE30, '2026-08-24')).toBe(true);
  });

  it('is_active=false não vale em data nenhuma', () => {
    const off = { ...ONZE30, is_active: false };
    expect(tipoVigenteNoDia(off, '2026-08-30')).toBe(false);
    expect(tipoVigenteNoDia(off, '2026-01-01')).toBe(false);
  });

  it('tipo sem vigência vale sempre (é o caso da maioria)', () => {
    expect(tipoVigenteNoDia(ONZE30, '2020-01-01')).toBe(true);
    expect(tipoVigenteNoDia(ONZE30, '2030-12-31')).toBe(true);
  });

  it('sem dia de referência, não filtra por vigência', () => {
    // A tela de configuração precisa listar TODOS os tipos, inclusive os
    // encerrados e os futuros — senão ninguém consegue editá-los.
    expect(filtrarVigentes(GRADE, undefined as any).length).toBe(4);
  });

  it('lista vazia e tipo nulo não estouram', () => {
    expect(filtrarVigentes([], '2026-08-30')).toEqual([]);
    expect(filtrarVigentes(null as any, '2026-08-30')).toEqual([]);
    expect(tipoVigenteNoDia(null as any, '2026-08-30')).toBe(false);
  });
});
