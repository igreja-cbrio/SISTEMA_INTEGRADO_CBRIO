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
  textoQuando, textoAreas, textoEvento, horaBRT, diaRelativoBRT, nomeJaDizODia,
  ehEscalaKids, antecedenciaDaEscala, antecedenciaDoGrupo,
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
    // Sem "domingo," porque o {{2}} é "Culto de Domingo" e o dia não se repete
    // (ver o bloco "sem repetir o dia da semana").
    expect(g[0].params[2]).toBe('16/08, às 08:30, 10:00 e 19:00');
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
    // ⚠️ Nome que NÃO diz o dia de propósito: com "Culto de Domingo" o texto
    // omitiria o dia da semana (ver "sem repetir o dia da semana") e o teste
    // deixaria de vigiar o fuso, que é o que ele existe pra vigiar.
    const g = agruparParaAviso({
      escalas: [esc({ service_name: 'Culto AMI', scheduled_at: DOM_1900 })], agora: AGORA,
    });
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

describe('⚠️ véspera · diasAlvo recorta o disparo (14/08)', () => {
  it('com diasAlvo, só o dia pedido é avisado', () => {
    // O cron manda só AMANHÃ. Sem este recorte, o disparo de véspera avisaria
    // a semana inteira de uma vez e a pessoa receberia com 7 dias de folga —
    // que é justamente o que o Matheus pediu para mudar.
    const g = agruparParaAviso({
      escalas: [
        esc({ id: 'a', scheduled_at: DOM_0830 }),                        // 16/08
        esc({ id: 'b', volunteer_id: 'p2', scheduled_at: '2026-08-12T20:00:00-03:00' }), // 12/08
      ],
      agora: AGORA,
      diasAlvo: new Set(['2026-08-12']),
    });
    expect(g).toHaveLength(1);
    expect(g[0].escala_ids).toEqual(['b']);
  });

  it('aceita array além de Set', () => {
    const g = agruparParaAviso({ escalas: [esc({ scheduled_at: DOM_0830 })], agora: AGORA, diasAlvo: ['2026-08-16'] });
    expect(g).toHaveLength(1);
  });

  it('sem diasAlvo, mantém a janela antiga (o botão manual usa)', () => {
    const g = agruparParaAviso({ escalas: [esc({ scheduled_at: DOM_0830 })], agora: AGORA });
    expect(g).toHaveLength(1);
  });

  it('⚠️ diaRelativoBRT("amanhã") é o dia da IGREJA', () => {
    // Às 22h do Rio (01h UTC do dia seguinte) "amanhã" em UTC já é depois de
    // amanhã — e o aviso de véspera sairia para o dia errado, ou para nenhum.
    expect(diaRelativoBRT('2026-08-15T22:00:00-03:00', 1)).toBe('2026-08-16');
    expect(diaRelativoBRT('2026-08-15T06:00:00-03:00', 1)).toBe('2026-08-16');
    expect(diaRelativoBRT('2026-08-15T22:00:00-03:00', 0)).toBe('2026-08-15');
  });
});

describe('⚠️ sem repetir o dia da semana (14/08)', () => {
  // Reparo do Matheus vendo a prévia do template na Meta: a mensagem monta
  // "{{2}} — {{3}}", e com "Culto de Domingo" no {{2}} saía
  // "Culto de Domingo — domingo, 16/08…".
  const dom = (over: any = {}) => esc({ service_name: 'Culto de Domingo', scheduled_at: DOM_0830, ...over });

  it('nome que já diz o dia → o {{3}} não repete', () => {
    const g = agruparParaAviso({ escalas: [dom()], agora: AGORA });
    expect(g[0].params[1]).toBe('Culto de Domingo');
    expect(g[0].params[2]).toBe('16/08, às 08:30');
  });

  it('nome que NÃO diz o dia → o dia continua', () => {
    // "Culto AMI" e "Bridge" não dizem que são sábado; sem o dia, a pessoa
    // precisa ir conferir no calendário.
    const g = agruparParaAviso({
      escalas: [esc({ service_name: 'Culto AMI', scheduled_at: '2026-08-15T20:00:00-03:00' })],
      agora: AGORA,
    });
    expect(g[0].params[2]).toBe('sábado, 15/08, às 20:00');
  });

  it('⚠️ culto de nome "Domingo" REAGENDADO pro sábado diz sábado', () => {
    // A comparação é com o dia REAL do culto. Omitir aqui esconderia
    // justamente o que evita a pessoa aparecer no dia errado.
    const g = agruparParaAviso({
      escalas: [esc({ service_name: 'Culto de Domingo', scheduled_at: '2026-08-15T18:00:00-03:00' })],
      agora: AGORA,
    });
    expect(g[0].params[2]).toBe('sábado, 15/08, às 18:00');
  });

  it('⚠️ com VÁRIOS cultos o {{2}} vira "2 cultos" e o dia volta pro {{3}}', () => {
    const g = agruparParaAviso({
      escalas: [
        esc({ id: 'a', service_name: 'Culto de Domingo', scheduled_at: DOM_0830 }),
        esc({ id: 'b', service_name: 'CBKIDS Manhã', scheduled_at: DOM_1000 }),
      ],
      agora: AGORA,
    });
    expect(g[0].params[1]).toBe('2 cultos');
    expect(g[0].params[2]).toBe('domingo, 16/08, às 08:30 e 10:00');
  });

  it('"quarta-feira" casa com "Quarta com Deus"', () => {
    expect(nomeJaDizODia('Quarta com Deus', '2026-08-12T20:00:00-03:00')).toBe(true);
    expect(nomeJaDizODia('Culto AMI', '2026-08-15T20:00:00-03:00')).toBe(false);
    expect(nomeJaDizODia(null, DOM_0830)).toBe(false);
  });

  it('textoQuando sem horários e com omissão', () => {
    expect(textoQuando(DOM_0830, [], true)).toBe('16/08');
    expect(textoQuando(DOM_0830, [])).toBe('domingo, 16/08');
  });
});

// ⚠️⚠️ ANTECEDÊNCIA POR ÁREA (21/08/2026). Pedido do Matheus: *"os voluntários
// que são do kids, recebessem 3 dias antes do culto, para que a Mari Gaia e a
// Milena possam se organizar para escalar outra pessoa no lugar."*
//
// A véspera serve pra LEMBRAR quem já vai; não serve pra REPOR. Descobrir no
// sábado que falta gente no Kids no domingo não dá tempo de achar substituto.
describe('antecedência por área · Kids avisa 3 dias antes', () => {
  const AGORA = '2026-08-19T12:00:00.000Z'; // quarta, 09:00 BRT
  const DOM = '2026-08-23T12:30:00.000Z';   // domingo 09:30 BRT (D+4)
  const QUI = '2026-08-20T22:00:00.000Z';   // quinta 19:00 BRT (D+1)

  const esc = (over: Record<string, unknown> = {}) => ({
    id: 's1', volunteer_id: 'v1', volunteer_name: 'Ana',
    team_name: 'Kids', service_name: 'Culto de Domingo',
    confirmation_status: 'pending', ...over,
  });

  it('⚠️ decide pela ÁREA da equipe, nunca pelo NOME', () => {
    expect(ehEscalaKids({ team_area: 'KIDS' })).toBe(true);
    expect(ehEscalaKids({ team_area: 'kids' })).toBe(true);
    expect(ehEscalaKids({ team_area: ' Kids ' })).toBe(true);
    expect(ehEscalaKids({ team_area: 'Louvor' })).toBe(false);
    // nome "CBKIDS" com área de outro time NÃO é Kids
    expect(ehEscalaKids({ team_area: 'Produção', team_name: 'CBKIDS' })).toBe(false);
    // sem área (as 116 equipes inativas) não vira Kids por acidente
    expect(ehEscalaKids({ team_area: null })).toBe(false);
    expect(ehEscalaKids({})).toBe(false);
    expect(ehEscalaKids(null as never)).toBe(false);
  });

  it('Kids = 3 dias, resto = véspera', () => {
    expect(antecedenciaDaEscala(esc({ team_area: 'KIDS' }))).toBe(3);
    expect(antecedenciaDaEscala(esc({ team_area: 'Louvor' }))).toBe(1);
    expect(antecedenciaDaEscala(esc())).toBe(1);
  });

  it('⚠️⚠️ o grupo usa a MAIOR antecedência — senão quem serve no Kids E em outra área recebe DUAS mensagens pelo mesmo domingo', () => {
    expect(antecedenciaDoGrupo([{ team_area: 'Louvor' }, { team_area: 'KIDS' }])).toBe(3);
    expect(antecedenciaDoGrupo([{ team_area: 'Louvor' }, { team_area: 'Produção' }])).toBe(1);
    expect(antecedenciaDoGrupo([])).toBe(1);
  });

  it('⚠️ no dia certo o Kids entra, e nos outros dias NÃO — nada de avisar D-3, D-2 e véspera', () => {
    const kids = [esc({ id: 'k', team_area: 'KIDS', scheduled_at: DOM })];
    // quarta 09:00 BRT → domingo é D+4: ainda não
    expect(agruparParaAviso({ escalas: kids, agora: AGORA, dias: 4, porAntecedencia: true })).toHaveLength(0);
    // quinta → domingo é D+3: entra
    const naQuinta = agruparParaAviso({ escalas: kids, agora: '2026-08-20T12:00:00.000Z', dias: 4, porAntecedencia: true });
    expect(naQuinta).toHaveLength(1);
    expect(naQuinta[0].antecedencia).toBe(3);
    // ⚠️ sábado → D+1: o grupo AINDA entra na régua pura. Quem impede a segunda
    // mensagem é a DEDUP de `selecionarRodada` (a escala já tem envio
    // registrado), não o corte por dia — e é isso que faz a régua se recuperar
    // de um dia perdido em vez de deixar a pessoa sem aviso nenhum.
    expect(agruparParaAviso({ escalas: kids, agora: '2026-08-22T12:00:00.000Z', dias: 4, porAntecedencia: true })).toHaveLength(1);
  });

  it('⚠️⚠️ RECUPERA o dia perdido: Kids que passou do D-3 ainda é avisado (o vão de 21/08)', () => {
    // Ligar os 3 dias em 21/08 deixou o culto de 23/08 sem aviso: o D-3 dele
    // (20/08) já tinha passado. 38 pessoas do Kids ficaram sem nada pro domingo.
    const kids = [esc({ id: 'k', team_area: 'KIDS', scheduled_at: DOM })];
    const atrasado = agruparParaAviso({ escalas: kids, agora: '2026-08-22T12:00:00.000Z', dias: 4, porAntecedencia: true });
    expect(atrasado).toHaveLength(1);
    expect(atrasado[0].antecedencia).toBe(3);
  });

  it('quem não é do Kids segue na véspera', () => {
    const louvor = [esc({ id: 'l', team_area: 'Louvor', scheduled_at: QUI, service_name: 'Quarta com Deus' })];
    // quarta → quinta é D+1: entra
    expect(agruparParaAviso({ escalas: louvor, agora: AGORA, dias: 4, porAntecedencia: true })).toHaveLength(1);
    // dois dias antes: não
    expect(agruparParaAviso({ escalas: louvor, agora: '2026-08-18T12:00:00.000Z', dias: 4, porAntecedencia: true })).toHaveLength(0);
  });

  it('⚠️ pessoa no Kids E no Louvor no mesmo dia: UMA mensagem, no D-3, cobrindo as duas', () => {
    const misto = [
      esc({ id: 'a', team_area: 'KIDS', team_name: 'Kids', scheduled_at: DOM }),
      esc({ id: 'b', team_area: 'Louvor', team_name: 'Louvor', scheduled_at: DOM }),
    ];
    const noD3 = agruparParaAviso({ escalas: misto, agora: '2026-08-20T12:00:00.000Z', dias: 4, porAntecedencia: true });
    expect(noD3).toHaveLength(1);
    expect(noD3[0].escala_ids.sort()).toEqual(['a', 'b']);
    // ⚠️ na véspera o grupo ainda aparece na régua pura — quem não deixa sair a
    // segunda mensagem é a dedup, não o corte por dia.
    expect(agruparParaAviso({ escalas: misto, agora: '2026-08-22T12:00:00.000Z', dias: 4, porAntecedencia: true })).toHaveLength(1);
  });

  it('⚠️ sem a área (leitura falhou), TODO MUNDO cai na véspera — ninguém fica sem aviso', () => {
    const semArea = [esc({ id: 'x', team_area: null, scheduled_at: QUI })];
    expect(agruparParaAviso({ escalas: semArea, agora: AGORA, dias: 4, porAntecedencia: true })).toHaveLength(1);
  });

  it('quem RECUSOU continua fora, e culto que já passou também', () => {
    const recusou = [esc({ id: 'r', team_area: 'KIDS', scheduled_at: DOM, confirmation_status: 'declined' })];
    expect(agruparParaAviso({ escalas: recusou, agora: '2026-08-20T12:00:00.000Z', dias: 4, porAntecedencia: true })).toHaveLength(0);
    const passou = [esc({ id: 'p', team_area: 'KIDS', scheduled_at: '2026-08-16T12:00:00.000Z' })];
    expect(agruparParaAviso({ escalas: passou, agora: AGORA, dias: 4, porAntecedencia: true })).toHaveLength(0);
  });

  it('o modo antigo (diasAlvo) segue intacto — é o botão manual', () => {
    const kids = [esc({ id: 'k', team_area: 'KIDS', scheduled_at: DOM })];
    const manual = agruparParaAviso({ escalas: kids, agora: AGORA, dias: 7, diasAlvo: null });
    expect(manual).toHaveLength(1);
  });
});
