import { describe, it, expect } from 'vitest';

import { avaliarProntidaoFuncionario } from '../../backend/utils/rhOnboardingProntidao.js';

function completo(over = {}) {
  return {
    telefone: '(21) 99999-8888',
    cpf: '52998224725',
    data_nascimento: '1990-05-10',
    endereco: 'Rua das Flores, 123',
    ...over,
  };
}

describe('avaliarProntidaoFuncionario', () => {
  it('cadastro com os 4 campos considerado completo', () => {
    expect(avaliarProntidaoFuncionario(completo())).toEqual({ completo: true, faltando: [] });
  });

  it('telefone ausente entra em faltando', () => {
    expect(avaliarProntidaoFuncionario(completo({ telefone: null })).faltando).toContain('telefone');
  });

  it('cpf ausente entra em faltando', () => {
    expect(avaliarProntidaoFuncionario(completo({ cpf: '' })).faltando).toContain('cpf');
  });

  it('data_nascimento ausente entra em faltando', () => {
    expect(avaliarProntidaoFuncionario(completo({ data_nascimento: null })).faltando).toContain('data_nascimento');
  });

  it('endereco em branco (só espaços) conta como ausente', () => {
    expect(avaliarProntidaoFuncionario(completo({ endereco: '   ' })).faltando).toContain('endereco');
  });

  it('vários campos ausentes acumulam na lista', () => {
    const r = avaliarProntidaoFuncionario({ telefone: null, cpf: null, data_nascimento: null, endereco: null });
    expect(r.completo).toBe(false);
    expect(r.faltando).toEqual(['telefone', 'cpf', 'data_nascimento', 'endereco']);
  });

  it('NÃO exige e-mail nem sexo (a porta pública não coleta)', () => {
    const r = avaliarProntidaoFuncionario(completo({ email: null, sexo: null }));
    expect(r.completo).toBe(true);
  });

  it('objeto vazio/undefined não lança e marca tudo faltando', () => {
    expect(() => avaliarProntidaoFuncionario(undefined)).not.toThrow();
    expect(avaliarProntidaoFuncionario({}).faltando.length).toBe(4);
  });
});
