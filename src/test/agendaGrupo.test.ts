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

// ─────────────────────────────────────────────────────────────────────────────
// 2ª rodada (18/08/2026) · CADÊNCIA e LIMITE de remarcação.
//
// ⚠️⚠️ `mem_grupos.recorrencia` existe desde sempre e a régua NÃO a lia:
// somava 7 dias em todo grupo. Medido em produção: dos 104 ativos, **37 não
// são semanais** (29 quinzenal · 5 mensal · 3 diário) — um terço via data
// errada no box "Próximo encontro".
//
// ⚠️ O limite de remarcação é `min(7 dias, véspera do próximo encontro)`.
// A metade "véspera do próximo" sai da cadência do grupo (semanal ⇒ 6 dias);
// o teto de 7 impede que um grupo MENSAL empurre a reunião para o dia anterior
// à seguinte, criando duas em dias seguidos.
// ─────────────────────────────────────────────────────────────────────────────
import { cadenciaDias, janelaRemarcacao, LIMITE_REMARCA_DIAS } from '../../backend/utils/agendaGrupo.js';

// Quarta-feira 19/08/2026, 09:00 BRT.
const QUA_09H = new Date('2026-08-19T12:00:00Z');
const terca = (extra: Record<string, unknown> = {}) =>
  proximasOcorrencias({ diaSemana: 2, horario: '20:00', agora: QUA_09H, quantas: 4, ...extra });

describe('cadência · a recorrência do grupo manda', () => {
  it('semanal anda de 7 em 7', () => {
    expect(terca({ recorrencia: 'semanal' }).map(o => o.data))
      .toEqual(['2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15']);
  });

  it('⚠️ quinzenal COM âncora anda de 14 em 14 a partir dela', () => {
    // Âncora = encontro realizado em 11/08 (terça). Próximos: 25/08, 08/09…
    expect(terca({ recorrencia: 'quinzenal', ancoraISO: '2026-08-11' }).map(o => o.data))
      .toEqual(['2026-08-25', '2026-09-08', '2026-09-22', '2026-10-06']);
  });

  it('⚠️ mensal = 28 dias, pra continuar caindo na MESMA terça', () => {
    const ds = terca({ recorrencia: 'mensal', ancoraISO: '2026-08-04' });
    expect(ds.map(o => o.data)).toEqual(['2026-09-01', '2026-09-29', '2026-10-27', '2026-11-24']);
    for (const o of ds) expect(o.dia_semana).toBe(2); // sempre terça
  });

  it('diário ignora dia_semana e anda de 1 em 1', () => {
    const ds = proximasOcorrencias({ diaSemana: 2, horario: '20:00', recorrencia: 'diario', agora: QUA_09H, quantas: 3 });
    expect(ds.map(o => o.data)).toEqual(['2026-08-19', '2026-08-20', '2026-08-21']);
  });

  it('recorrência nula/desconhecida cai no semanal (a maioria)', () => {
    expect(cadenciaDias(null)).toBe(7);
    expect(cadenciaDias('esporadico')).toBe(7);
    expect(cadenciaDias('QUINZENAL')).toBe(14);
  });

  it('⚠️⚠️ quinzenal SEM âncora devolve UMA ocorrência, declarada incerta', () => {
    // Saber "de 14 em 14 às terças" não diz EM QUAL terça. Listar a agenda
    // inteira seria chute com cara de fato — 36 dos 37 grupos não-semanais
    // nunca registraram um encontro.
    const ds = terca({ recorrencia: 'quinzenal' });
    expect(ds).toHaveLength(1);
    expect(ds[0].ancora_incerta).toBe(true);
  });

  it('semanal NUNCA é incerto — não depende de âncora', () => {
    expect(terca({ recorrencia: 'semanal' }).every(o => o.ancora_incerta === false)).toBe(true);
  });
});

describe('janela de remarcação · min(7 dias, véspera do próximo)', () => {
  it('semanal: 6 dias, porque o próximo encontro é em 7', () => {
    const [primeiro] = terca({ recorrencia: 'semanal' });
    expect(primeiro.data_original).toBe('2026-08-25');
    expect(primeiro.remarcar_ate).toBe('2026-08-31'); // 25 + 6
    expect(primeiro.pode_remarcar).toBe(true);
  });

  it('⚠️ quinzenal: o teto de 7 dias manda (não os 13 da cadência)', () => {
    const [primeiro] = terca({ recorrencia: 'quinzenal', ancoraISO: '2026-08-11' });
    expect(primeiro.remarcar_ate).toBe('2026-09-01'); // 25 + 7, não 25 + 13
  });

  it('⚠️⚠️ mensal: o teto de 7 impede duas reuniões em dias seguidos', () => {
    const [primeiro] = terca({ recorrencia: 'mensal', ancoraISO: '2026-08-04' });
    // Sem o teto seria 28/09 — véspera do encontro de 29/09.
    expect(primeiro.remarcar_ate).toBe('2026-09-08');
  });

  it('nunca no passado: o piso é HOJE', () => {
    const [primeiro] = terca({ recorrencia: 'semanal' });
    expect(primeiro.remarcar_de).toBe('2026-08-19'); // hoje, não 18/08
  });

  it('não invade o encontro ANTERIOR', () => {
    const j = janelaRemarcacao({
      dataOriginal: '2026-09-01', anteriorISO: '2026-08-25',
      proximaISO: '2026-09-08', hojeISO: '2026-08-19',
    });
    expect(j).toMatchObject({ de: '2026-08-26', ate: '2026-09-07', pode: true });
  });

  it('⚠️ espremida entre a véspera e o dia seguinte, a janela vira O PRÓPRIO DIA', () => {
    // Escrevi este caso esperando `pode: false` e o código me corrigiu: sobra
    // a data original, e mexer só no HORÁRIO ("hoje vai ser 21h") é uso
    // legítimo. Recusar aqui tiraria uma ação válida sem ganhar nada.
    const j = janelaRemarcacao({
      dataOriginal: '2026-09-01', anteriorISO: '2026-08-31',
      proximaISO: '2026-09-02', hojeISO: '2026-09-01',
    });
    expect(j).toMatchObject({ de: '2026-09-01', ate: '2026-09-01', pode: true });
  });

  it('⚠️ janela REALMENTE vazia devolve pode=false', () => {
    // Só resta cancelar quando nem o próprio dia sobra (o encontro seguinte
    // caiu em cima dele).
    const j = janelaRemarcacao({
      dataOriginal: '2026-09-01', anteriorISO: '2026-09-01',
      proximaISO: '2026-09-01', hojeISO: '2026-08-19',
    });
    expect(j.pode).toBe(false);
  });

  it('o limite é 7 e mudá-lo é decisão, não acidente', () => {
    expect(LIMITE_REMARCA_DIAS).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3ª rodada (18/08) · o ENCONTRO ANTERIOR, com exceção aplicada.
//
// Relato do Marcos: *"alterei o meu do dia 18 para o dia 20 mas a frequência
// ainda está em cima marcando próximo encontro hoje dia 18"*. O herói da tela
// de gerenciar calculava sozinho por `dia_semana` e não sabia das exceções —
// duas contas para "quando é o encontro" sempre divergem.
// ─────────────────────────────────────────────────────────────────────────────
import { ocorrenciaAnterior } from '../../backend/utils/agendaGrupo.js';

// Terça 18/08/2026, 14:00 BRT (o encontro é às 20h — ainda vai acontecer).
const TER_14H = new Date('2026-08-18T17:00:00Z');
const anterior = (excecoes: any[] = []) =>
  ocorrenciaAnterior({ diaSemana: 2, horario: '20:00', excecoes, agora: TER_14H });

describe('encontro anterior · é o que decide "faltou registrar"', () => {
  it('sem exceção, a anterior é a ocorrência de hoje', () => {
    expect(anterior()).toMatchObject({ data: '2026-08-18', status: 'normal' });
  });

  it('⚠️⚠️ remarcado 18 → 20: a anterior volta a ser 11, não 18', () => {
    // Era este o bug: o topo continuava cobrando a chamada do dia 18, que o
    // líder acabara de mover para o dia 20.
    expect(anterior([{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-20' }]))
      .toMatchObject({ data: '2026-08-11' });
  });

  it('⚠️ encontro CANCELADO não gera pendência de chamada', () => {
    expect(anterior([{ data_original: '2026-08-18', status: 'cancelado' }])).toBeNull();
  });

  it('remarcado para TRÁS (antecipado) passa a ser a anterior', () => {
    expect(anterior([{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-17' }]))
      .toMatchObject({ data: '2026-08-17', data_original: '2026-08-18' });
  });

  it('grupo sem dia_semana devolve null, não erro', () => {
    expect(ocorrenciaAnterior({ diaSemana: null, horario: '20:00', agora: TER_14H })).toBeNull();
  });
});
