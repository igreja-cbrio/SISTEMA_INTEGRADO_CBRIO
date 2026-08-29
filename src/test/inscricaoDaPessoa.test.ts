import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chavesDaPessoa, inscricaoEhDaPessoa, mesclarInscricoes } = require('../../backend/utils/inscricaoDaPessoa');

// CPFs com DV válido (gerados para teste, não são de ninguém).
const CPF_DELA = '52998224725';
const CPF_OUTRO = '11144477735';

describe('chavesDaPessoa', () => {
  it('devolve o vínculo e o CPF normalizado', () => {
    expect(chavesDaPessoa({ id: 'm1', cpf: '529.982.247-25' }))
      .toEqual({ membroId: 'm1', cpf: CPF_DELA });
  });

  it('CPF inválido não vira chave — senão o app reivindicaria inscrição por lixo', () => {
    expect(chavesDaPessoa({ id: 'm1', cpf: '11111111111' }).cpf).toBeNull();
    expect(chavesDaPessoa({ id: 'm1', cpf: '123' }).cpf).toBeNull();
    expect(chavesDaPessoa({ id: 'm1', cpf: null }).cpf).toBeNull();
  });
});

describe('inscricaoEhDaPessoa', () => {
  const chaves = chavesDaPessoa({ id: 'm1', cpf: CPF_DELA });

  it('vínculo direto vale', () => {
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: 'm1' }, chaves)).toBe(true);
  });

  it('órfã com o CPF dela é dela — é o caso que deixava o QR inalcançável', () => {
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: null, cpf: CPF_DELA }, chaves)).toBe(true);
  });

  it('⚠️ inscrição de OUTRO cadastro nunca entra, mesmo com o CPF batendo', () => {
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: 'm2', cpf: CPF_DELA }, chaves)).toBe(false);
  });

  it('órfã com CPF de outra pessoa não entra', () => {
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: null, cpf: CPF_OUTRO }, chaves)).toBe(false);
  });

  it('órfã sem CPF nenhum não entra — nada a identifica com segurança', () => {
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: null, cpf: null }, chaves)).toBe(false);
  });

  it('sem CPF no cadastro, só o vínculo vale (comportamento de sempre)', () => {
    const semCpf = chavesDaPessoa({ id: 'm1', cpf: null });
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: 'm1' }, semCpf)).toBe(true);
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: null, cpf: CPF_DELA }, semCpf)).toBe(false);
  });

  it('CPF com máscara na inscrição casa igual', () => {
    expect(inscricaoEhDaPessoa({ id: 'i', membro_id: null, cpf: '529.982.247-25' }, chaves)).toBe(true);
  });
});

describe('mesclarInscricoes', () => {
  const chaves = chavesDaPessoa({ id: 'm1', cpf: CPF_DELA });

  it('não repete a mesma inscrição', () => {
    const a = [{ id: 'i1', membro_id: 'm1' }];
    const b = [{ id: 'i1', membro_id: 'm1' }];
    expect(mesclarInscricoes(a, b, chaves).map((i: any) => i.id)).toEqual(['i1']);
  });

  it('acrescenta a órfã e preserva a ordem do vínculo', () => {
    const a = [{ id: 'i1', membro_id: 'm1' }];
    const b = [{ id: 'i2', membro_id: null, cpf: CPF_DELA }];
    expect(mesclarInscricoes(a, b, chaves).map((i: any) => i.id)).toEqual(['i1', 'i2']);
  });

  it('⚠️ filtra o que não é dela mesmo vindo na 2ª lista', () => {
    const b = [{ id: 'i9', membro_id: 'm2', cpf: CPF_DELA }];
    expect(mesclarInscricoes([], b, chaves)).toEqual([]);
  });

  it('listas vazias/nulas não quebram', () => {
    expect(mesclarInscricoes(undefined, undefined, chaves)).toEqual([]);
  });
});
