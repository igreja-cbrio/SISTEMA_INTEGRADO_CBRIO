import { describe, it, expect } from 'vitest';
// Import no padrão da casa: régua de backend/utils exercitada pelo vitest da raiz.
import {
  HORARIO_NEXT, ENCONTROS_POR_TURMA, domingosDoMes, diaDaSemana, nomeTurma,
  turmasPlanejadas, mesesAGarantir, domingosInscritiveis, proximoMes, hojeBRT, mesDe,
} from '../../backend/utils/nextTurmas.js';

describe('nextTurmas · a régua das turmas do mês', () => {
  it('o Next acontece no culto de 09:30 e a turma tem UM encontro', () => {
    expect(HORARIO_NEXT).toBe('09:30');
    expect(ENCONTROS_POR_TURMA).toBe(1);
  });

  it('acha os domingos de um mês de 4 domingos', () => {
    expect(domingosDoMes('2026-09')).toEqual(
      ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'],
    );
  });

  it('acha os CINCO domingos quando o mês tem cinco', () => {
    // Novembro/2026 começa num domingo → 1, 8, 15, 22, 29.
    // Decisão do Matheus: uma turma por domingo, então aqui são 5.
    expect(domingosDoMes('2026-11')).toEqual(
      ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'],
    );
  });

  it('fevereiro de ano bissexto não inventa dia 30', () => {
    const fev = domingosDoMes('2028-02'); // 2028 é bissexto
    expect(fev.every(d => d.startsWith('2028-02-'))).toBe(true);
    expect(fev.every(d => Number(d.slice(-2)) <= 29)).toBe(true);
  });

  it('mês inválido devolve lista vazia em vez de estourar', () => {
    for (const m of ['', '2026-13', '2026-00', '26-09', 'setembro', null as any, undefined as any]) {
      expect(domingosDoMes(m)).toEqual([]);
    }
  });

  it('⚠️ dia da semana NÃO depende do fuso da máquina', () => {
    // 06/09/2026 é domingo. Com `new Date('2026-09-06').getDay()` no Rio isso
    // daria SÁBADO (a data é lida como meia-noite UTC = 21h do dia anterior),
    // e o gerador pularia todos os domingos.
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';
      expect(diaDaSemana('2026-09-06')).toBe(0);
      expect(domingosDoMes('2026-09')).toContain('2026-09-06');
      process.env.TZ = 'Pacific/Kiritimati'; // UTC+14
      expect(diaDaSemana('2026-09-06')).toBe(0);
      expect(domingosDoMes('2026-09')).toContain('2026-09-06');
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    }
  });

  it('nenhum dia gerado deixa de ser domingo', () => {
    for (const mes of ['2026-01', '2026-02', '2026-06', '2026-11', '2027-03']) {
      for (const d of domingosDoMes(mes)) expect(diaDaSemana(d)).toBe(0);
    }
  });

  it('o nome da turma leva o ano', () => {
    expect(nomeTurma('2026-09-06')).toBe('Next · 06/09/2026');
    expect(nomeTurma('2026-9-6')).toBeNull();
    expect(nomeTurma('')).toBeNull();
  });

  it('cada turma planejada tem exatamente UM encontro, no próprio domingo', () => {
    const t = turmasPlanejadas('2026-09', new Date('2026-08-01T12:00:00Z'));
    expect(t).toHaveLength(4);
    for (const x of t) {
      expect(x.encontros).toHaveLength(1);
      expect(x.encontros[0].numero).toBe(1);
      expect(x.encontros[0].data).toBe(x.data);
      expect(x.horario).toBe('09:30');
    }
  });

  it('⚠️ NÃO planeja turma para domingo que já passou', () => {
    // 26/08/2026 (quarta). Agosto tem domingos 02, 09, 16, 23 e 30 — só o 30 vem.
    const agora = new Date('2026-08-26T15:00:00Z');
    expect(turmasPlanejadas('2026-08', agora).map(t => t.data)).toEqual(['2026-08-30']);
  });

  it('planeja o mês seguinte inteiro', () => {
    const agora = new Date('2026-08-26T15:00:00Z');
    expect(turmasPlanejadas('2026-09', agora).map(t => t.data)).toEqual(
      ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'],
    );
  });

  it('mês inteiro no passado não planeja nada', () => {
    const agora = new Date('2026-08-26T15:00:00Z');
    expect(turmasPlanejadas('2026-07', agora)).toEqual([]);
  });

  it('o numero do encontro é 1 mesmo no 5º domingo (o CHECK do banco é 1..4)', () => {
    const t = turmasPlanejadas('2026-11', new Date('2026-10-01T12:00:00Z'));
    expect(t).toHaveLength(5);
    expect(t.map(x => x.encontros[0].numero)).toEqual([1, 1, 1, 1, 1]);
  });

  it('garante o mês corrente E o seguinte', () => {
    expect(mesesAGarantir(new Date('2026-08-26T12:00:00Z'))).toEqual(['2026-08', '2026-09']);
    // ⚠️ vira o ano sem gerar mês 13
    expect(mesesAGarantir(new Date('2026-12-15T12:00:00Z'))).toEqual(['2026-12', '2027-01']);
  });

  it('proximoMes vira o ano em dezembro', () => {
    expect(proximoMes('2026-12')).toBe('2027-01');
    expect(proximoMes('2026-01')).toBe('2026-02');
    expect(proximoMes('2026-13')).toBeNull();
  });

  it('⚠️ o dia de hoje é o do fuso da IGREJA, não o UTC', () => {
    // 23h de 26/08 no Rio já é 27/08 em UTC. O dia da igreja tem de ser 26.
    expect(hojeBRT(new Date('2026-08-27T02:00:00Z'))).toBe('2026-08-26');
    expect(mesDe(hojeBRT(new Date('2026-09-01T02:00:00Z')))).toBe('2026-08');
  });

  it('domingo que já passou não é oferecido no formulário', () => {
    const agora = new Date('2026-09-14T12:00:00Z'); // segunda, 14/09
    const dias = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'];
    expect(domingosInscritiveis(dias, agora)).toEqual(['2026-09-20', '2026-09-27']);
  });

  it('o domingo de HOJE continua sendo opção', () => {
    const agora = new Date('2026-09-20T13:00:00Z'); // domingo 20/09, 10h no Rio
    expect(domingosInscritiveis(['2026-09-13', '2026-09-20'], agora)).toEqual(['2026-09-20']);
  });

  it('lixo na lista de domingos não vira opção', () => {
    const agora = new Date('2026-09-01T12:00:00Z');
    expect(domingosInscritiveis(['', 'amanhã', '2026-9-6', '2026-09-06'] as any, agora))
      .toEqual(['2026-09-06']);
    expect(domingosInscritiveis(null as any, agora)).toEqual([]);
  });
});
