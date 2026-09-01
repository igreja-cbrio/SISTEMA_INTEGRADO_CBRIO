// ============================================================================
// BirthDatePicker · a régua de DIGITAR a data (2026-08-07)
//
// O componente passou a aceitar digitação além do calendário (pedido do
// Matheus). O que precisa de guarda é o parser: ele decide o que vira valor
// gravado no cadastro de uma pessoa.
//
// ⚠️ Data é injetada onde importa. Teste que lê o relógio da máquina foi o que
// mordeu no `faixaEtaria.test.ts`; aqui o único uso de "agora" é a recusa de
// data futura, e ela é testada com um ano absurdo (2999), não com "hoje + 1".
// ============================================================================

import { describe, it, expect } from 'vitest';
import { brParaIso, mascarar, isoParaDate } from '@/components/ui/birth-date-picker';

const MIN = 1900;
const MAX = new Date().getFullYear();

describe('mascarar', () => {
  it('insere as barras sozinha, na medida em que a pessoa digita', () => {
    expect(mascarar('0')).toBe('0');
    expect(mascarar('07')).toBe('07');
    expect(mascarar('0708')).toBe('07/08');
    expect(mascarar('07081992')).toBe('07/08/1992');
  });

  it('ignora o que não é dígito — colar "07/08/1992" não duplica barra', () => {
    expect(mascarar('07/08/1992')).toBe('07/08/1992');
    expect(mascarar('07-08-1992')).toBe('07/08/1992');
    expect(mascarar('  07 08 1992  ')).toBe('07/08/1992');
  });

  it('para em 8 dígitos: tecla presa não vira ano de 6 casas', () => {
    expect(mascarar('070819920000')).toBe('07/08/1992');
  });

  it('apagar até o fim devolve vazio (não deixa barra órfã)', () => {
    expect(mascarar('')).toBe('');
    expect(mascarar('/')).toBe('');
  });
});

describe('brParaIso', () => {
  it('converte data real', () => {
    expect(brParaIso('07/08/1992', MIN, MAX)).toBe('1992-08-07');
    expect(brParaIso('01/01/1978', MIN, MAX)).toBe('1978-01-01');
  });

  it('data incompleta não vira valor', () => {
    expect(brParaIso('', MIN, MAX)).toBe('');
    expect(brParaIso('07', MIN, MAX)).toBe('');
    expect(brParaIso('07/08', MIN, MAX)).toBe('');
    expect(brParaIso('07/08/19', MIN, MAX)).toBe('');
  });

  // ⚠️ MUTATION TEST: sem a reconferência do dia depois do parse, o date-fns
  // normaliza 31/02 para 03/03 e o cadastro guardaria uma data que a pessoa
  // NUNCA digitou.
  it('recusa dia que não existe no mês, em vez de deslizar para o mês seguinte', () => {
    expect(brParaIso('31/02/1990', MIN, MAX)).toBe('');
    expect(brParaIso('31/04/1990', MIN, MAX)).toBe('');
    expect(brParaIso('30/02/2000', MIN, MAX)).toBe('');
  });

  it('29/02 vale em ano bissexto e não vale fora dele', () => {
    expect(brParaIso('29/02/2000', MIN, MAX)).toBe('2000-02-29');
    expect(brParaIso('29/02/1900', MIN, MAX)).toBe('');  // 1900 não é bissexto
    expect(brParaIso('29/02/2001', MIN, MAX)).toBe('');
  });

  it('recusa mês e dia fora de faixa', () => {
    expect(brParaIso('07/13/1992', MIN, MAX)).toBe('');
    expect(brParaIso('07/00/1992', MIN, MAX)).toBe('');
    expect(brParaIso('00/08/1992', MIN, MAX)).toBe('');
  });

  it('recusa data no futuro — ninguém nasceu amanhã', () => {
    expect(brParaIso('07/08/2999', MIN, 2999)).toBe('');
  });

  it('respeita a faixa de anos que o consumidor declarou', () => {
    expect(brParaIso('07/08/1899', MIN, MAX)).toBe('');
    // anoMin/anoMax servem justamente pra restringir (ex.: menor de idade).
    expect(brParaIso('07/08/1992', 2000, MAX)).toBe('');
  });

  // ⚠️ O off-by-one de fuso: 'YYYY-MM-DD' cru é meia-noite UTC = dia anterior
  // no Rio. O par brParaIso → isoParaDate tem que devolver o MESMO dia.
  it('ida e volta preserva o dia (sem deslizar por fuso)', () => {
    const iso = brParaIso('01/03/1985', MIN, MAX);
    expect(iso).toBe('1985-03-01');
    const d = isoParaDate(iso)!;
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(2);
    expect(d.getFullYear()).toBe(1985);
  });
});
