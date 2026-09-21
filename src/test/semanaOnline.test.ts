// A semana do card de views do Online.
//
// ⚠️⚠️ O caso que este arquivo existe para travar: **domingo 22h no Rio ainda
// é domingo**, mas em UTC já é segunda. Decidir a semana em UTC faria o card,
// na noite de domingo, mostrar a semana que ainda está ACONTECENDO como se
// fosse a fechada — e a faixa das 21h é justamente a do culto de domingo à
// noite, quando alguém do Online abriria a tela.
//
// ⚠️ Os casos de fuso FORÇAM `TZ=America/Sao_Paulo` dentro do próprio caso: o
// gate roda em UTC, e sem forçar o fuso o mutante "dia em UTC" SOBREVIVE.
// Já aconteceu duas vezes neste repositório (divisorMandala 24/08,
// promptDiagnostico 31/08).
import { describe, it, expect } from 'vitest';
const { semanaAnteriorBRT, somarViews, DIAS_CONSOLIDACAO } = require('../../backend/utils/semanaOnline');

function comFuso<T>(tz: string, fn: () => T): T {
  const antes = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (antes === undefined) delete process.env.TZ;
    else process.env.TZ = antes;
  }
}

describe('semanaAnteriorBRT · qual semana o card mostra', () => {
  it('na segunda de manhã mostra a semana que acabou de fechar', () => {
    // 21/09/2026 (segunda) 09:00 BRT
    const s = semanaAnteriorBRT(Date.parse('2026-09-21T12:00:00Z'));
    expect(s.inicio).toBe('2026-09-14');
    expect(s.fim).toBe('2026-09-20');
    expect(s.rotulo).toBe('14/09 a 20/09');
  });

  it('a semana vai de SEGUNDA a DOMINGO', () => {
    const s = semanaAnteriorBRT(Date.parse('2026-09-23T15:00:00Z'));
    expect(new Date(`${s.inicio}T00:00:00Z`).getUTCDay()).toBe(1); // segunda
    expect(new Date(`${s.fim}T00:00:00Z`).getUTCDay()).toBe(0);    // domingo
  });

  it('⚠️⚠️ domingo 22h NO RIO ainda é domingo — a semana anterior é a de antes', () => {
    comFuso('America/Sao_Paulo', () => {
      // 21/09 01:00 UTC = 20/09 22:00 BRT (domingo à noite, durante o culto)
      const s = semanaAnteriorBRT(Date.parse('2026-09-21T01:00:00Z'));
      // Em UTC já seria segunda 21/09 e o card mostraria 14–20/09 — uma semana
      // que ainda está acontecendo.
      expect(s.inicio).toBe('2026-09-07');
      expect(s.fim).toBe('2026-09-13');
    });
  });

  it('⚠️ segunda 00:30 BRT (03:30 UTC) já mostra a semana fechada', () => {
    comFuso('America/Sao_Paulo', () => {
      const s = semanaAnteriorBRT(Date.parse('2026-09-21T03:30:00Z'));
      expect(s.fim).toBe('2026-09-20');
    });
  });

  it('atravessa a virada de ano sem quebrar', () => {
    // 05/01/2027 é uma terça
    const s = semanaAnteriorBRT(Date.parse('2027-01-05T15:00:00Z'));
    expect(s.inicio < s.fim).toBe(true);
    expect(new Date(`${s.inicio}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(Date.parse(`${s.fim}T00:00:00Z`)).toBeLessThan(Date.parse('2027-01-05T00:00:00Z'));
  });

  it('⚠️ o rótulo é DD/MM e não escorrega de dia por fuso', () => {
    comFuso('America/Sao_Paulo', () => {
      const s = semanaAnteriorBRT(Date.parse('2026-09-21T12:00:00Z'));
      // `new Date('2026-09-14').getDate()` daria 13 no Rio.
      expect(s.rotulo).toBe('14/09 a 20/09');
    });
  });
});

describe('⚠️ consolidação · o número ainda sobe nos primeiros dias', () => {
  it('na segunda a semana está consolidando', () => {
    expect(semanaAnteriorBRT(Date.parse('2026-09-21T12:00:00Z')).consolidando).toBe(true);
  });

  it('na terça ainda está consolidando', () => {
    expect(semanaAnteriorBRT(Date.parse('2026-09-22T12:00:00Z')).consolidando).toBe(true);
  });

  it('de quarta em diante o número é final', () => {
    expect(semanaAnteriorBRT(Date.parse('2026-09-23T12:00:00Z')).consolidando).toBe(false);
    expect(semanaAnteriorBRT(Date.parse('2026-09-25T12:00:00Z')).consolidando).toBe(false);
  });

  it('a janela é de 2 dias, que é o que o YouTube ainda ajusta', () => {
    expect(DIAS_CONSOLIDACAO).toBe(2);
  });
});

describe('⚠️⚠️ somarViews · ausência NUNCA vira zero', () => {
  const linhas = [
    { data: '2026-09-13', views: 999, watch_minutos: 10 },   // fora (semana anterior)
    { data: '2026-09-14', views: 4191, watch_minutos: 100 },
    { data: '2026-09-15', views: 2970, watch_minutos: 80 },
    { data: '2026-09-20', views: 606, watch_minutos: 20 },
    { data: '2026-09-21', views: 268, watch_minutos: 5 },    // fora (é hoje)
  ];

  it('soma só o que está DENTRO do intervalo', () => {
    const r = somarViews(linhas, '2026-09-14', '2026-09-20');
    expect(r.views).toBe(4191 + 2970 + 606);
    expect(r.dias_com_dado).toBe(3);
  });

  it('⚠️⚠️ sem nenhuma linha devolve NULL, nunca 0', () => {
    // "não coletamos" e "ninguém assistiu" levam a decisões opostas.
    const r = somarViews([], '2026-09-14', '2026-09-20');
    expect(r.views).toBeNull();
    expect(r.dias_com_dado).toBe(0);
  });

  it('⚠️ declara a COBERTURA — dia sem coleta some da soma sem avisar', () => {
    // 3 de 7 dias: sem esse número, ninguém distingue queda de audiência de
    // cron que falhou.
    const r = somarViews(linhas, '2026-09-14', '2026-09-20');
    expect(r.dias_com_dado).toBeLessThan(7);
  });

  it('entrada inválida não derruba nem inventa número', () => {
    expect(somarViews(null as any, '2026-09-14', '2026-09-20').views).toBeNull();
    const r = somarViews([{ data: '2026-09-15', views: 'x' } as any], '2026-09-14', '2026-09-20');
    expect(r.views).toBe(0);          // a linha existe, o valor é ilegível
    expect(r.dias_com_dado).toBe(1);  // ...e a cobertura diz que ela veio
  });

  it('watch_minutos ausente não vira zero', () => {
    const r = somarViews([{ data: '2026-09-15', views: 100 }], '2026-09-14', '2026-09-20');
    expect(r.views).toBe(100);
    expect(r.watch_minutos).toBeNull();
  });

  it('aceita data com timestamp (o PostgREST pode devolver assim)', () => {
    const r = somarViews([{ data: '2026-09-15T00:00:00+00:00', views: 50 }], '2026-09-14', '2026-09-20');
    expect(r.views).toBe(50);
  });
});
