import { describe, it, expect } from 'vitest';
import { proximasOcorrencias, proximoEncontro, agoraBRT } from '../../backend/utils/agendaGrupo.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pedido da Naná (18/08/2026): no box "Próximo encontro" do app, o líder poder
// remarcar ou cancelar UMA ocorrência.
//
// ⚠️ O encontro recorrente NÃO é uma linha: é derivado de dia_semana+horario.
// Aqui se testa a régua que aplica as EXCEÇÕES em cima disso — e o fuso, que
// era um bug real do cálculo antigo.
// ─────────────────────────────────────────────────────────────────────────────

// 16/08/2026 é um DOMINGO. 23:00Z = 20:00 BRT do mesmo domingo.
const DOM_20H_BRT = new Date('2026-08-16T23:00:00Z');
// 02:00Z de segunda = 23:00 BRT de domingo — o dia UTC já virou.
const DOM_23H_BRT = new Date('2026-08-17T02:00:00Z');

describe('fuso · o dia de operação é BRT (bug do cálculo antigo)', () => {
  it('às 23h BRT de domingo ainda é DOMINGO', () => {
    expect(agoraBRT(DOM_23H_BRT)).toMatchObject({ dia: 16, diaSemana: 0, hora: 23 });
  });

  it('⚠️ grupo de domingo NÃO pula uma semana às 23h BRT de domingo', () => {
    // O antigo fazia new Date().getDay() em UTC (= segunda) e devolvia 23/08.
    // O encontro das 19h já passou, então o próximo é 23/08 — mas por ter
    // passado a HORA, não porque o servidor achou que era segunda.
    const p = proximoEncontro({ diaSemana: 0, horario: '19:00', agora: DOM_23H_BRT });
    expect(p?.data).toBe('2026-08-23');
  });

  it('encontro de HOJE que ainda não começou continua sendo o próximo', () => {
    expect(proximoEncontro({ diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT })?.data).toBe('2026-08-16');
  });

  it('o instante devolvido é o horário BRT convertido (não UTC cru)', () => {
    const p = proximoEncontro({ diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT });
    expect(p?.inicio).toBe('2026-08-17T00:00:00.000Z'); // 21h BRT = 00h UTC do dia seguinte
  });
});

describe('exceções · cancelar e remarcar UMA ocorrência', () => {
  const base = { diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT };

  it('cancelar pula a ocorrência no "próximo encontro"', () => {
    const p = proximoEncontro({ ...base, excecoes: [{ data_original: '2026-08-16', status: 'cancelado' }] });
    expect(p?.data).toBe('2026-08-23');
  });

  it('⚠️ mas a cancelada CONTINUA na lista, marcada — pra poder desfazer', () => {
    const l = proximasOcorrencias({ ...base, excecoes: [{ data_original: '2026-08-16', status: 'cancelado' }] });
    expect(l[0]).toMatchObject({ data: '2026-08-16', status: 'cancelado' });
  });

  it('remarcar muda data e hora daquela ocorrência só', () => {
    const l = proximasOcorrencias({
      ...base,
      excecoes: [{ data_original: '2026-08-16', status: 'remarcado', nova_data: '2026-08-18', novo_horario: '20:00' }],
    });
    expect(l[0]).toMatchObject({ data_original: '2026-08-16', data: '2026-08-18', horario: '20:00', status: 'remarcado' });
    expect(l[1]).toMatchObject({ data: '2026-08-23', status: 'normal' }); // a seguinte NÃO muda
  });

  it('remarcar para o passado some da lista de futuros (não ressuscita)', () => {
    const l = proximasOcorrencias({
      ...base,
      excecoes: [{ data_original: '2026-08-16', status: 'remarcado', nova_data: '2026-08-10' }],
    });
    expect(l.find(o => o.data_original === '2026-08-16')).toBeUndefined();
  });

  it('exceção de OUTRA data não afeta a próxima', () => {
    const l = proximasOcorrencias({ ...base, excecoes: [{ data_original: '2026-09-06', status: 'cancelado' }] });
    expect(l[0]).toMatchObject({ data: '2026-08-16', status: 'normal' });
  });

  it('todas as próximas canceladas ⇒ próximo encontro é null (o app diz isso)', () => {
    const ex = ['2026-08-16', '2026-08-23', '2026-08-30'].map(d => ({ data_original: d, status: 'cancelado' }));
    const l = proximasOcorrencias({ ...base, excecoes: ex, quantas: 3, janelaDias: 15 });
    expect(l.every(o => o.status === 'cancelado')).toBe(true);
    expect(proximoEncontro({ ...base, excecoes: ex, quantas: 3, janelaDias: 15 })).toBeNull();
  });
});

describe('⚠️ o que não pode quebrar', () => {
  it('grupo sem dia_semana devolve lista vazia, não erro', () => {
    expect(proximasOcorrencias({ diaSemana: null, horario: '19:00' })).toEqual([]);
    expect(proximoEncontro({ diaSemana: undefined, horario: '19:00' })).toBeNull();
  });

  it('dia_semana 0 (DOMINGO) funciona — é falsy e já mordeu este módulo antes', () => {
    const p = proximoEncontro({ diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT });
    expect(p?.data).toBe('2026-08-16');
  });

  it('dia_semana inválido não gera data maluca', () => {
    expect(proximasOcorrencias({ diaSemana: 9, horario: '19:00' })).toEqual([]);
  });

  it('sem exceções, o comportamento é o de sempre', () => {
    const l = proximasOcorrencias({ diaSemana: 3, horario: '20:00', agora: DOM_20H_BRT, quantas: 3 });
    expect(l.map(o => o.data)).toEqual(['2026-08-19', '2026-08-26', '2026-09-02']);
    expect(l.every(o => o.status === 'normal')).toBe(true);
  });
});
