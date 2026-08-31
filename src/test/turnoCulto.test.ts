import { describe, it, expect } from 'vitest';
import { turnoDoCulto, agruparPorTurno, LIMITE_MANHA } from '../lib/turnoCulto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { turnoDoTipo } = require('../../backend/utils/lentesDomingo');

const D = (nome: string, hora: string | null, v: number, media: number, taxa: number | null) => ({
  nome, service_type_id: nome, valor_absoluto: v, media, taxa_ocupacao: taxa,
  recurrence_day: 0, recurrence_time: hora,
});
const QUARTA = {
  nome: 'Quarta', service_type_id: 'q', valor_absoluto: 218, media: 283,
  taxa_ocupacao: 20.8, recurrence_day: 3, recurrence_time: '19:30',
};

describe('turnoDoCulto', () => {
  it('só domingo tem turno — Quarta, AMI e Bridge não', () => {
    expect(turnoDoCulto(QUARTA)).toBeNull();
    expect(turnoDoCulto({ nome: 'AMI', recurrence_day: 6, recurrence_time: '20:00' })).toBeNull();
  });

  it('manhã até 12h; a partir dela noite', () => {
    expect(turnoDoCulto(D('a', '09:30', 0, 0, null))).toBe('manha');
    expect(turnoDoCulto(D('a', '11:30', 0, 0, null))).toBe('manha');
    expect(turnoDoCulto(D('a', '11:59', 0, 0, null))).toBe('manha');
    expect(turnoDoCulto(D('a', '12:00', 0, 0, null))).toBe('noite');
    expect(turnoDoCulto(D('a', '19:00', 0, 0, null))).toBe('noite');
  });

  it('⚠️ domingo SEM horário não vira manhã', () => {
    expect(turnoDoCulto(D('a', null, 0, 0, null))).toBeNull();
    expect(turnoDoCulto(D('a', 'manhã', 0, 0, null))).toBeNull();
  });

  it('⚠️⚠️ a fronteira é a MESMA da lente da aba Domingo (são espelhos)', () => {
    for (const h of ['08:30', '09:30', '10:00', '11:30', '11:59', '12:00', '19:00']) {
      expect(turnoDoCulto(D('x', h, 0, 0, null))).toBe(turnoDoTipo({ recurrence_time: `${h}:00` }));
    }
    expect(LIMITE_MANHA).toBe('12:00');
  });
});

describe('agruparPorTurno', () => {
  // Os números REAIS da semana 35 (print do Matheus): 09:30=376, 11:30=616, 19:00=327
  const SEMANA35 = [
    QUARTA,
    { nome: 'Bridge', service_type_id: 'b', valor_absoluto: 0, media: 31, taxa_ocupacao: null, recurrence_day: 6, recurrence_time: '17:00' },
    { nome: 'AMI', service_type_id: 'a', valor_absoluto: 113, media: 136, taxa_ocupacao: 10.8, recurrence_day: 6, recurrence_time: '20:00' },
    D('Dom 09:30', '09:30', 376, 376, 35.8),
    D('Dom 11:30', '11:30', 616, 623, 58.7),
    D('Dom 19:00', '19:00', 327, 373, 31.1),
  ];
  const g = agruparPorTurno(SEMANA35);
  const acha = (n: string) => g.find((x) => x.nome === n);

  it('junta a manhã e mantém os outros dias intactos', () => {
    expect(g.map((x) => x.nome)).toEqual(['Quarta', 'Bridge', 'AMI', 'Dom manhã', 'Dom noite']);
    expect(acha('Quarta')!.valor_absoluto).toBe(218);
  });

  it('soma o valor e a média histórica do turno', () => {
    expect(acha('Dom manhã')!.valor_absoluto).toBe(376 + 616);
    expect(acha('Dom manhã')!.media).toBe(376 + 623);
    expect(acha('Dom noite')!.valor_absoluto).toBe(327);
  });

  it('⚠️⚠️ a ocupação do turno é MÉDIA, não soma — somar diria 94,5%', () => {
    // (35.8 + 58.7) / 2 = 47.25 → 47.3
    expect(acha('Dom manhã')!.taxa_ocupacao).toBe(47.3);
    expect(acha('Dom noite')!.taxa_ocupacao).toBe(31.1);
  });

  it('declara quantos cultos entraram no grupo', () => {
    expect(acha('Dom manhã')!.cultos).toBe(2);
    expect(acha('Dom noite')!.cultos).toBe(1);
    expect(acha('Quarta')!.cultos).toBe(1);
  });

  it('⚠️ o grupo NÃO carrega service_type_id de um membro', () => {
    expect(acha('Dom manhã')!.service_type_id).toBeNull();
  });

  it('turno sem nenhum culto não vira barra vazia', () => {
    const so = agruparPorTurno([D('Dom 09:30', '09:30', 100, 100, 10)]);
    expect(so.map((x) => x.nome)).toEqual(['Dom manhã']);
  });

  it('culto sem taxa não estraga a média do grupo', () => {
    const r = agruparPorTurno([D('a', '09:30', 100, 100, 20), D('b', '11:30', 100, 100, null)]);
    expect(acha.call(null, 'x')).toBeUndefined();
    expect(r[0].taxa_ocupacao).toBe(20);
  });

  it('lista vazia devolve vazio', () => {
    expect(agruparPorTurno([])).toEqual([]);
  });
});
