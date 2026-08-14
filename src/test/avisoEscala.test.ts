// Contrato do aviso de escala na semana do serviço.
//
// Pedido do Matheus (14/08/2026): "toda vez que a pessoa for escalada, deve ser
// avisada na semana do serviço". O que existia era manual, alcançava só quem
// tinha confirmação pendente, e dependia de alguém apertar o botão.
//
// ⚠️ MUTATION-TEST das três decisões que sustentam o disparo:
//   · agrupar por (pessoa, dia) — sem isso, quem serve nos 4 cultos de domingo
//     recebe 4 mensagens quase idênticas, que é o padrão que a Meta lê como
//     spam e que derruba a nota de qualidade do número da igreja;
//   · culto que já passou nunca é avisado;
//   · quem RECUSOU não é lembrado.
//
// O "agora" é sempre injetado — nenhum caso depende do relógio da máquina.
import { describe, it, expect } from 'vitest';
import {
  elegivelParaAviso, agruparParaAviso, selecionarRodada,
  textoQuando, textoAreas, textoEvento, horaBRT,
} from '../../backend/utils/avisoEscala.js';

const AGORA = '2026-08-11T09:00:00-03:00'; // terça
const DOM_0830 = '2026-08-16T08:30:00-03:00';
const DOM_1000 = '2026-08-16T10:00:00-03:00';
const DOM_1900 = '2026-08-16T19:00:00-03:00';

const esc = (over: any = {}) => ({
  id: over.id || 's1',
  volunteer_id: over.volunteer_id === undefined ? 'p1' : over.volunteer_id,
  planning_center_person_id: over.planning_center_person_id || null,
  volunteer_name: over.volunteer_name || 'Ana',
  team_name: over.team_name === undefined ? 'Banda' : over.team_name,
  service_name: over.service_name === undefined ? 'Culto de Domingo' : over.service_name,
  scheduled_at: over.scheduled_at || DOM_0830,
  confirmation_status: over.confirmation_status || 'pending',
});

describe('elegivelParaAviso · o que entra na janela', () => {
  it('culto dentro dos 7 dias entra', () => {
    expect(elegivelParaAviso(esc(), AGORA, 7)).toBe(true);
  });

  it('⚠️ culto que JÁ PASSOU nunca entra', () => {
    // MUTANTE: sem esta guarda, a pessoa recebe "você serve hoje" na
    // segunda-feira, sobre o domingo que já aconteceu.
    expect(elegivelParaAviso(esc({ scheduled_at: '2026-08-09T10:00:00-03:00' }), AGORA, 7)).toBe(false);
  });

  it('culto além da janela não entra (ainda)', () => {
    expect(elegivelParaAviso(esc({ scheduled_at: '2026-09-20T10:00:00-03:00' }), AGORA, 7)).toBe(false);
  });

  it('⚠️ quem RECUSOU não é lembrado', () => {
    // A pessoa já disse que não vai. Insistir num compromisso recusado é
    // constrangimento, não lembrete.
    expect(elegivelParaAviso(esc({ confirmation_status: 'declined' }), AGORA, 7)).toBe(false);
  });

  it('confirmado É lembrado — o aviso é da semana, não da confirmação', () => {
    expect(elegivelParaAviso(esc({ confirmation_status: 'confirmed' }), AGORA, 7)).toBe(true);
  });

  it('linha sem pessoa identificável fica fora', () => {
    expect(elegivelParaAviso(esc({ volunteer_id: null }), AGORA, 7)).toBe(false);
  });

  it('data podre não derruba nem entra', () => {
    expect(elegivelParaAviso(esc({ scheduled_at: 'ontem' }), AGORA, 7)).toBe(false);
  });
});

describe('agruparParaAviso · UMA mensagem por pessoa e dia', () => {
  it('⚠️ 3 cultos no mesmo dia viram UM aviso', () => {
    // MUTANTE: agrupar por escala manda 3 mensagens quase idênticas para a
    // mesma pessoa — o padrão que a Meta lê como spam.
    const g = agruparParaAviso({
      escalas: [
        esc({ id: 'a', scheduled_at: DOM_0830 }),
        esc({ id: 'b', scheduled_at: DOM_1000 }),
        esc({ id: 'c', scheduled_at: DOM_1900 }),
      ],
      agora: AGORA,
    });
    expect(g).toHaveLength(1);
    expect(g[0].escala_ids.sort()).toEqual(['a', 'b', 'c']);
    expect(g[0].params[2]).toBe('domingo, 16/08, às 08:30, 10:00 e 19:00');
  });

  it('pessoas diferentes no mesmo dia são grupos diferentes', () => {
    const g = agruparParaAviso({
      escalas: [esc({ id: 'a' }), esc({ id: 'b', volunteer_id: 'p2', volunteer_name: 'Bruno' })],
      agora: AGORA,
    });
    expect(g).toHaveLength(2);
  });

  it('mesma pessoa em dias diferentes recebe um aviso por dia', () => {
    const g = agruparParaAviso({
      escalas: [esc({ id: 'a' }), esc({ id: 'b', scheduled_at: '2026-08-13T20:00:00-03:00' })],
      agora: AGORA,
    });
    expect(g).toHaveLength(2);
  });

  it('junta as áreas quando a pessoa serve em duas no mesmo dia', () => {
    const g = agruparParaAviso({
      escalas: [
        esc({ id: 'a', team_name: 'Banda', scheduled_at: DOM_0830 }),
        esc({ id: 'b', team_name: 'Cuidados', scheduled_at: DOM_1000 }),
      ],
      agora: AGORA,
    });
    expect(g[0].params[0]).toBe('Banda e Cuidados');
    expect(g[0].params[1]).toBe('Culto de Domingo'); // mesmo nome nos dois
  });

  it('⚠️ o culto de domingo 19h NÃO cai na segunda', () => {
    const g = agruparParaAviso({ escalas: [esc({ scheduled_at: DOM_1900 })], agora: AGORA });
    expect(g[0].dia).toBe('2026-08-16');
    expect(g[0].params[2]).toContain('domingo, 16/08');
  });

  it('⚠️ evento das 21:30 de sábado não vira "domingo, 00:30"', () => {
    // MUTANTE do fuso: 21:30 BRT é 00:30 UTC do dia SEGUINTE. Só passa das
    // 21h o texto quebra — e é por isso que o culto de 19h sozinho não é
    // guarda suficiente. Ensaio, vigília e evento de véspera caem aqui.
    const sab2130 = '2026-08-15T21:30:00-03:00';
    const g = agruparParaAviso({ escalas: [esc({ scheduled_at: sab2130 })], agora: AGORA });
    expect(g[0].dia).toBe('2026-08-15');
    expect(g[0].params[2]).toBe('sábado, 15/08, às 21:30');
    expect(horaBRT(sab2130)).toBe('21:30');
  });

  it('ordena por quem serve primeiro — com teto, o domingo não fica para depois', () => {
    const g = agruparParaAviso({
      escalas: [
        esc({ id: 'a', volunteer_id: 'p1', scheduled_at: DOM_0830 }),
        esc({ id: 'b', volunteer_id: 'p2', scheduled_at: '2026-08-12T20:00:00-03:00' }),
      ],
      agora: AGORA,
    });
    expect(g.map((x: any) => x.pessoa)).toEqual(['p2', 'p1']);
  });
});

describe('selecionarRodada · quem sai agora', () => {
  const grupos = [
    { chave: 'k1', pessoa: 'p1', escala_ids: ['a'], primeiro: DOM_0830, params: [] as any },
    { chave: 'k2', pessoa: 'p2', escala_ids: ['b'], primeiro: DOM_1000, params: [] as any },
  ];

  it('⚠️ grupo já avisado não repete — o registro é por QUALQUER escala dele', () => {
    const r = selecionarRodada({
      grupos, jaAvisados: new Set(['a']),
      telefonePorPessoa: new Map([['p1', '21999999999'], ['p2', '21988888888']]),
    });
    expect(r.ja_avisados).toBe(1);
    expect(r.rodada.map((x: any) => x.pessoa)).toEqual(['p2']);
  });

  it('sem telefone sai da rodada e é DECLARADO, não some', () => {
    const r = selecionarRodada({
      grupos, jaAvisados: new Set(), telefonePorPessoa: new Map([['p1', '21999999999']]),
    });
    expect(r.rodada).toHaveLength(1);
    expect(r.sem_telefone.map((g: any) => g.pessoa)).toEqual(['p2']);
  });

  it('⚠️ o teto adia em vez de descartar', () => {
    const r = selecionarRodada({
      grupos, jaAvisados: new Set(),
      telefonePorPessoa: new Map([['p1', '1'], ['p2', '2']]), teto: 1,
    });
    expect(r.rodada).toHaveLength(1);
    expect(r.adiados).toBe(1);
  });

  it('aceita objeto simples no lugar do Map (tolerância de chamador)', () => {
    const r = selecionarRodada({ grupos, jaAvisados: [], telefonePorPessoa: { p1: '1', p2: '2' } });
    expect(r.rodada).toHaveLength(2);
    expect(r.adiados).toBe(0);
  });
});

describe('textos do template', () => {
  it('um horário só não vira lista', () => {
    expect(textoQuando(DOM_0830, ['08:30'])).toBe('domingo, 16/08, às 08:30');
  });
  it('dois horários usam "e"', () => {
    expect(textoQuando(DOM_0830, ['08:30', '10:00'])).toBe('domingo, 16/08, às 08:30 e 10:00');
  });
  it('horário repetido não duplica', () => {
    expect(textoQuando(DOM_0830, ['08:30', '08:30'])).toBe('domingo, 16/08, às 08:30');
  });
  it('sem área não inventa nome', () => {
    expect(textoAreas([])).toBe('Voluntariado');
    expect(textoAreas([null, undefined])).toBe('Voluntariado');
  });
  it('vários cultos viram contagem', () => {
    expect(textoEvento(['A', 'B', 'C'])).toBe('3 cultos');
    expect(textoEvento(['A', 'A'])).toBe('A');
  });
  it('hora em BRT, não UTC', () => {
    expect(horaBRT(DOM_1900)).toBe('19:00');
  });
});
