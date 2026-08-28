import { describe, it, expect } from 'vitest';
import { equipeSupervisionada, filtrarPorSupervisao, supervisionaTudo } from '../../backend/utils/supervisorArea';

// As áreas reais depois do remapeamento de 16/08.
const BANDA      = { name: 'Banda', area: 'Louvor' };
const PRODUCAO   = { name: 'Produção', area: 'Produção' };
const KIDS       = { name: 'Kids', area: 'KIDS' };
const SEM_AREA   = { name: 'Equipe nova', area: null };

describe('equipeSupervisionada', () => {
  it('vê a área que supervisiona e não vê as outras', () => {
    expect(equipeSupervisionada(PRODUCAO, ['Produção'])).toBe(true);
    expect(equipeSupervisionada(BANDA, ['Produção'])).toBe(false);
  });

  it('compara sem acento e sem caixa — "KIDS" e "kids" são a mesma área', () => {
    expect(equipeSupervisionada(KIDS, ['kids'])).toBe(true);
    expect(equipeSupervisionada(PRODUCAO, ['producao'])).toBe(true);
  });

  it("'geral' supervisiona tudo — é o que preserva quem já tinha acesso", () => {
    expect(supervisionaTudo(['geral'])).toBe(true);
    expect(equipeSupervisionada(BANDA, ['geral'])).toBe(true);
    expect(equipeSupervisionada(SEM_AREA, ['geral'])).toBe(true);
  });

  it('⚠️ equipe SEM área não pertence a ninguém', () => {
    // Deixá-la visível "porque não dá pra saber de quem é" devolveria o
    // comportamento antigo — todo supervisor vendo tudo — bastando uma equipe
    // ficar sem área.
    expect(equipeSupervisionada(SEM_AREA, ['Produção'])).toBe(false);
    expect(equipeSupervisionada(SEM_AREA, [])).toBe(false);
  });

  it('⚠️ sem nenhuma área, não vê NADA — a lista vazia não é curinga', () => {
    // É o bug que existia: `if (!areas.length) 403` e depois ignorar a lista
    // fazia lista vazia e lista cheia terminarem no mesmo lugar.
    expect(equipeSupervisionada(BANDA, [])).toBe(false);
    expect(equipeSupervisionada(BANDA, undefined as any)).toBe(false);
  });

  it('supervisiona várias áreas', () => {
    const meu = ['Louvor', 'Produção'];
    expect(equipeSupervisionada(BANDA, meu)).toBe(true);
    expect(equipeSupervisionada(PRODUCAO, meu)).toBe(true);
    expect(equipeSupervisionada(KIDS, meu)).toBe(false);
  });
});

describe('filtrarPorSupervisao', () => {
  const composicao = [
    { area: 'Louvor', position_name: 'Vocal' },
    { area: 'Produção', position_name: 'Câmeras' },
    { area: 'KIDS', position_name: 'Baby' },
    { area: null, position_name: 'Órfã' },
  ];

  it('devolve só o que é da área do supervisor', () => {
    expect(filtrarPorSupervisao(composicao, ['Produção']).map(i => i.position_name))
      .toEqual(['Câmeras']);
  });

  it("'geral' devolve tudo, inclusive a sem área", () => {
    expect(filtrarPorSupervisao(composicao, ['geral']).length).toBe(4);
  });

  it('lista vazia de áreas devolve nada', () => {
    expect(filtrarPorSupervisao(composicao, [])).toEqual([]);
  });

  it('aceita ler a área de outro lugar do item', () => {
    const itens = [{ team: { area: 'Louvor' } }, { team: { area: 'KIDS' } }];
    expect(filtrarPorSupervisao(itens, ['Louvor'], (i: any) => i.team?.area).length).toBe(1);
  });
});
