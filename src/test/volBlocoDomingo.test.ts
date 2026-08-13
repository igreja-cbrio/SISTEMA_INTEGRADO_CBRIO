// Turno (bloco) do voluntariado · a régua que descarta em silêncio.
//
// POR QUE ESTE TESTE EXISTE: o Dashboard Semanal do voluntariado classifica um
// serviço pelo PREFIXO DO NOME, e o ramo desconhecido é **DESCARTADO, não
// zerado** (`WHERE bloco_id IS NOT NULL` na view · `WHERE bloco IS NOT NULL` na
// composição). Um culto que a régua não reconhece **some do relatório sem erro,
// sem log e sem virar um zero visível** — ~520 check-ins dependem desses
// literais hoje.
//
// Em 24/08/2026 o domingo perde o 08:30 e ganha um 09:30 (docs/cultos-domingo/).
// `'domingo 09'` foi acrescentado ANTES de o culto existir, exatamente para que o
// primeiro domingo novo não seja perdido.
//
// ⚠️ Este arquivo é o espelho JS de `public.fn_dash_vol_bloco_nome` (migration
// 20260811120000). Se um horário novo entrar num lado e não no outro, o card do
// Dashboard e o drill-down do relatório passam a discordar — que é pior que os
// dois estarem errados juntos.
import { describe, it, expect } from 'vitest';
import { blocoDoServico } from '../pages/ministerial/voluntariado/volMatch';

describe('blocoDoServico · cultos de domingo (grade nova e antiga)', () => {
  it('reconhece os quatro horários da grade ANTIGA como manhã/noite', () => {
    expect(blocoDoServico('Domingo 08:30')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 10:00')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 11:30')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 19:00')).toBe('Domingo Noite');
  });

  it('reconhece o 09:30 da grade NOVA — o motivo deste arquivo existir', () => {
    // Se isto quebrar, os check-ins do culto das 09:30 desaparecem do Dashboard
    // Semanal sem nenhum sinal de erro.
    expect(blocoDoServico('Domingo 09:30')).toBe('Domingo Manhã');
  });

  it('continua reconhecendo os serviços de TURNO do Planning Center', () => {
    // A escala vive nestes; os check-ins caem nos cultos. Mesmo turno.
    expect(blocoDoServico('Domingo - Manhã')).toBe('Domingo Manhã');
    expect(blocoDoServico('CBKIDS - Manhã Domingo')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo - Noite')).toBe('Domingo Noite');
    expect(blocoDoServico('CBKIDS - Noite')).toBe('Domingo Noite');
  });

  it('não confunde os outros cultos da semana', () => {
    expect(blocoDoServico('Quarta Com Deus')).toBe('Quarta');
    expect(blocoDoServico('Culto AMI')).toBe('AMI');
    expect(blocoDoServico('AMI')).toBe('AMI');
    expect(blocoDoServico('Bridge')).toBe('Bridge');
  });

  it('devolve null para serviço que NÃO é culto — e isso é o correto', () => {
    // 5 dos 18 nomes distintos em produção caem aqui (ex.: "GC 12 HORAS").
    // Eles viram linha própria no relatório, não somem.
    expect(blocoDoServico('GC 12 HORAS')).toBeNull();
    expect(blocoDoServico('')).toBeNull();
    expect(blocoDoServico(null)).toBeNull();
    expect(blocoDoServico(undefined)).toBeNull();
  });

  it('é insensível a caixa e a espaço nas pontas', () => {
    expect(blocoDoServico('  DOMINGO 09:30  ')).toBe('Domingo Manhã');
    expect(blocoDoServico('domingo 09:30')).toBe('Domingo Manhã');
  });

  it('exige o prefixo — não casa horário no meio do nome', () => {
    // A régua é por PREFIXO. "Ensaio Domingo 09:30" é ensaio, não culto, e a
    // classificação não deve inventar turno a partir de substring.
    expect(blocoDoServico('Ensaio Domingo 09:30')).toBeNull();
  });
});

describe('a manhã de domingo inteira cai num turno só', () => {
  it('grade nova: 09:30 e 11:30 no MESMO bloco', () => {
    // É o que faz a visão por turno atravessar o corte de 24/08 sem quebra —
    // 3 cultos de manhã antes, 2 depois, mesmo bloco.
    const novos = ['Domingo 09:30', 'Domingo 11:30'].map(blocoDoServico);
    expect(new Set(novos)).toEqual(new Set(['Domingo Manhã']));
  });

  it('grade antiga: os 3 da manhã também', () => {
    const antigos = ['Domingo 08:30', 'Domingo 10:00', 'Domingo 11:30'].map(blocoDoServico);
    expect(new Set(antigos)).toEqual(new Set(['Domingo Manhã']));
  });
});
