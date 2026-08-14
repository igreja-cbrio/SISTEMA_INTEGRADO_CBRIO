import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  paraDia,
  paraStr,
  hojeBRT,
  segundaDa,
  montarSemanas,
  inicioDaSemanaGrade,
  semanasDoMesGrade,
  mesVizinho,
  diasSobrepostos,
  faseDaSemana,
  montarCalendario,
} = require_('../../backend/utils/marketingSemanas.js');

// ---------------------------------------------------------------------------
// FASES REAIS de produção (medidas em 14/08/2026). São elas que validam a
// régua: o Pedro descreveu à mão em que fase cada série estaria "na semana que
// vem" e a régua tem que reproduzir os 4 casos dele.
// ---------------------------------------------------------------------------
const fase = (numero: number, nome: string, ini: string, fim: string, extra = {}) => ({
  id: `f${numero}-${ini}`, numero_fase: numero, nome_fase: nome,
  data_inicio_prevista: ini, data_fim_prevista: fim, area: 'marketing', status: 'pendente',
  ...extra,
});

const O_MUNDO = [
  fase(6, 'Execução Estratégica', '2026-07-25', '2026-08-08'),
  fase(7, 'Pré-Testes', '2026-08-08', '2026-08-15'),
  fase(8, 'Finalizações', '2026-08-15', '2026-08-22'),
  fase(9, 'Alinhamentos Operacionais Finais', '2026-08-22', '2026-09-05'),
  fase(10, 'Dia D', '2026-09-06', '2026-09-06'),
  fase(11, 'Debrief', '2026-09-07', '2026-09-13'),
];
const DIVERTIDAMENTE = [
  fase(4, 'Identidade e Estratégia', '2026-08-01', '2026-08-15'),
  fase(5, 'Aprovação', '2026-08-15', '2026-08-22'),
  fase(6, 'Execução Estratégica', '2026-08-22', '2026-09-05'),
];
const PARABOLAS = [
  fase(2, 'Briefing', '2026-08-08', '2026-08-15'),
  fase(3, 'Brainstorming e Conceito', '2026-08-15', '2026-08-29'),
  fase(4, 'Identidade e Estratégia', '2026-08-29', '2026-09-12'),
];
const REFORMA = [
  fase(2, 'Briefing', '2026-08-07', '2026-08-14'),
  fase(3, 'Brainstorming e Conceito', '2026-08-14', '2026-08-28'),
  fase(4, 'Identidade e Estratégia', '2026-08-28', '2026-09-11'),
];
// Ciclo que só começa em setembro — o caso das 3 séries que hoje não têm fase
// nenhuma na janela visível.
const PELOS_OLHOS = [
  fase(1, 'Pré Briefing', '2026-08-29', '2026-09-05'),
  fase(2, 'Briefing', '2026-09-05', '2026-09-12'),
];

const SEMANA_QUE_VEM = { idx: 1, ini: '2026-08-17', fim: '2026-08-23' };
const SEMANA_ATUAL = { idx: 0, ini: '2026-08-10', fim: '2026-08-16' };

describe('datas em string · nada de fuso local', () => {
  it('converte ida e volta sem deslocar o dia', () => {
    expect(paraStr(paraDia('2026-08-14'))).toBe('2026-08-14');
    expect(paraStr(paraDia('2026-01-01'))).toBe('2026-01-01');
    expect(paraStr(paraDia('2026-12-31'))).toBe('2026-12-31');
  });

  it('recusa entrada que não é data ISO', () => {
    expect(paraDia(null)).toBeNull();
    expect(paraDia('')).toBeNull();
    expect(paraDia('14/08/2026')).toBeNull();
    expect(paraDia('2026-8-14')).toBeNull();
  });

  it('aceita timestamptz cortando no dia', () => {
    expect(paraStr(paraDia('2026-08-14T23:59:00+00:00'))).toBe('2026-08-14');
  });

  // ⚠️ GUARDA: às 21h do Rio o dia UTC já virou. Sem o desconto de 3h, o
  // dashboard aberto à noite mostraria a semana errada como "atual".
  it('o hoje é o da igreja (BRT), não o UTC', () => {
    // 2026-08-15 00:30 UTC = 2026-08-14 21:30 no Rio
    expect(hojeBRT(Date.parse('2026-08-15T00:30:00Z'))).toBe('2026-08-14');
    // 2026-08-14 12:00 UTC = mesmo dia nos dois
    expect(hojeBRT(Date.parse('2026-08-14T12:00:00Z'))).toBe('2026-08-14');
    // 2026-08-14 02:00 UTC = 2026-08-13 23:00 no Rio
    expect(hojeBRT(Date.parse('2026-08-14T02:00:00Z'))).toBe('2026-08-13');
  });
});

describe('semana SEG→DOM', () => {
  it('acha a segunda a partir de qualquer dia da semana', () => {
    // 10/08/2026 é segunda · 16/08 é domingo
    expect(paraStr(segundaDa('2026-08-10'))).toBe('2026-08-10');
    expect(paraStr(segundaDa('2026-08-14'))).toBe('2026-08-10'); // sexta
    expect(paraStr(segundaDa('2026-08-16'))).toBe('2026-08-10'); // domingo
    expect(paraStr(segundaDa('2026-08-17'))).toBe('2026-08-17'); // vira a semana
  });

  it('monta a janela com a semana atual marcada', () => {
    const s = montarSemanas('2026-08-14', { retro: 1, adiante: 6 });
    expect(s).toHaveLength(8);
    expect(s[0]).toMatchObject({ ini: '2026-08-03', fim: '2026-08-09', eh_atual: false });
    expect(s[1]).toMatchObject({ ini: '2026-08-10', fim: '2026-08-16', eh_atual: true });
    expect(s[7]).toMatchObject({ ini: '2026-09-21', fim: '2026-09-27' });
    expect(s.filter((x: any) => x.eh_atual)).toHaveLength(1);
  });

  // ⚠️ GUARDA que saiu de um bug REAL: `parseInt(undefined) ?? 1` devolve NaN
  // (`??` não pega NaN), o NaN chegava aqui e o laço `for (i = NaN; NaN <= 6)`
  // não rodava nenhuma vez — o calendário voltava VAZIO sem erro nenhum, e a
  // tela dizia "nenhum ciclo ativo" com 7 ciclos ativos no banco.
  it('parâmetro inválido cai no padrão · com data válida NUNCA devolve janela vazia', () => {
    for (const ruim of [NaN, undefined, null, 'x', {}] as any[]) {
      const s = montarSemanas('2026-08-14', { retro: ruim, adiante: ruim });
      expect(s.length).toBeGreaterThan(0);
      expect(s.filter((x: any) => x.eh_atual)).toHaveLength(1);
    }
    // zero é uma escolha legítima (só daqui pra frente), não um valor inválido
    const so = montarSemanas('2026-08-14', { retro: 0, adiante: 0 });
    expect(so).toHaveLength(1);
    expect(so[0]).toMatchObject({ ini: '2026-08-10', eh_atual: true });
  });

  it('data inválida devolve janela vazia (aí sim não há semana a montar)', () => {
    expect(montarSemanas('14/08/2026')).toEqual([]);
    expect(montarSemanas(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GRADE MENSAL — o calendário do /eventos (mês + setas), com as fases na linha
// da semana. A grade começa no DOMINGO, como a do /eventos.
// ---------------------------------------------------------------------------
describe('grade mensal', () => {
  it('acha o início da semana da grade (domingo por padrão)', () => {
    // 14/08/2026 é SEXTA · o domingo daquela semana é 09/08
    expect(paraStr(inicioDaSemanaGrade('2026-08-14'))).toBe('2026-08-09');
    expect(paraStr(inicioDaSemanaGrade('2026-08-09'))).toBe('2026-08-09'); // domingo
    expect(paraStr(inicioDaSemanaGrade('2026-08-15'))).toBe('2026-08-09'); // sábado
    expect(paraStr(inicioDaSemanaGrade('2026-08-16'))).toBe('2026-08-16'); // vira
  });

  it('aceita grade começando na segunda (a semana da igreja)', () => {
    expect(paraStr(inicioDaSemanaGrade('2026-08-14', 1))).toBe('2026-08-10');
    expect(paraStr(inicioDaSemanaGrade('2026-08-16', 1))).toBe('2026-08-10'); // domingo fecha a semana
  });

  it('agosto/2026 tem 6 linhas e invade julho e setembro', () => {
    const g = semanasDoMesGrade('2026-08', { hoje: '2026-08-14' });
    expect(g).toHaveLength(6);
    expect(g[0]).toMatchObject({ ini: '2026-07-26', fim: '2026-08-01' });
    expect(g[5]).toMatchObject({ ini: '2026-08-30', fim: '2026-09-05' });
    // toda linha tem exatamente 7 dias
    for (const s of g) expect(s.dias).toHaveLength(7);
  });

  // ⚠️ GUARDA: dia da linha que pertence ao mês vizinho tem que vir marcado,
  // senão a tela pinta 26/07 como se fosse agosto.
  it('marca no_mes por dia', () => {
    const g = semanasDoMesGrade('2026-08');
    expect(g[0].dias.map((d: any) => d.no_mes)).toEqual([false, false, false, false, false, false, true]);
    expect(g[5].dias.map((d: any) => d.no_mes)).toEqual([true, true, false, false, false, false, false]);
  });

  it('marca o hoje e a semana atual em UMA linha só', () => {
    const g = semanasDoMesGrade('2026-08', { hoje: '2026-08-14' });
    expect(g.filter((s: any) => s.eh_semana_atual)).toHaveLength(1);
    expect(g[2]).toMatchObject({ ini: '2026-08-09', eh_semana_atual: true });
    const hojes = g.flatMap((s: any) => s.dias).filter((d: any) => d.eh_hoje);
    expect(hojes).toHaveLength(1);
    expect(hojes[0].data).toBe('2026-08-14');
  });

  it('mês visto de outro mês não marca semana atual', () => {
    const g = semanasDoMesGrade('2026-10', { hoje: '2026-08-14' });
    expect(g.some((s: any) => s.eh_semana_atual)).toBe(false);
  });

  // ⚠️ Fevereiro é o mês que pega erro de aritmética de calendário.
  it('fevereiro bissexto e não-bissexto fecham no dia certo', () => {
    const f2028 = semanasDoMesGrade('2028-02'); // bissexto · 29 dias
    const ultimoDoMes2028 = f2028.flatMap((s: any) => s.dias).filter((d: any) => d.no_mes).pop();
    expect(ultimoDoMes2028.data).toBe('2028-02-29');

    const f2027 = semanasDoMesGrade('2027-02');
    const ultimoDoMes2027 = f2027.flatMap((s: any) => s.dias).filter((d: any) => d.no_mes).pop();
    expect(ultimoDoMes2027.data).toBe('2027-02-28');
  });

  // ⚠️⚠️ GUARDA que saiu de um MUTANTE SOBREVIVENTE: assumir que todo mês acaba
  // no dia 31 parecia inofensivo porque `Date.parse('2028-02-31')` **não é
  // NaN** — o Node rola para 02/03. O estrago não é a data final (que o filtro
  // `no_mes` corrige) e sim uma **SEMANA FANTASMA** no fim da grade.
  // Fev/2026 é o caso limpo: começa domingo, acaba sábado, 4 linhas exatas.
  it('não inventa linha de semana no fim do mês', () => {
    const f = semanasDoMesGrade('2026-02');
    expect(f).toHaveLength(4);
    expect(f[0].ini).toBe('2026-02-01');
    expect(f[3].fim).toBe('2026-02-28');
    // e nenhum dia da grade cai fora de fevereiro
    expect(f.flatMap((s: any) => s.dias).every((d: any) => d.no_mes)).toBe(true);
  });

  it('dezembro e janeiro atravessam o ano', () => {
    expect(mesVizinho('2026-12', 1)).toBe('2027-01');
    expect(mesVizinho('2026-01', -1)).toBe('2025-12');
    expect(mesVizinho('2026-08', 1)).toBe('2026-09');
    expect(mesVizinho('2026-08', -1)).toBe('2026-07');
  });

  it('mês inválido devolve grade vazia em vez de estourar', () => {
    expect(semanasDoMesGrade('2026-13')).toEqual([]);
    expect(semanasDoMesGrade('agosto')).toEqual([]);
    expect(semanasDoMesGrade(null)).toEqual([]);
    expect(mesVizinho('xx', 1)).toBeNull();
  });

  // ⚠️⚠️ O CONTRATO DA GRADE: a fase de cada linha é calculada com o intervalo
  // que a linha EXIBE. Se um dia a grade virar SEG→DOM, a faixa muda com ela.
  it('a fase da linha corresponde aos dias que a linha mostra', () => {
    const g = semanasDoMesGrade('2026-08', { hoje: '2026-08-14' });
    const { linhas } = montarCalendario({
      eventos: [{ id: 'a', nome: 'O Mundo' }],
      fasesPorEvento: { a: O_MUNDO },
      semanas: g,
    });
    // linha de 16/08 a 22/08 (dom→sáb) · F8 vai de 15/08 a 22/08 = 7 dias
    expect(g[3]).toMatchObject({ ini: '2026-08-16', fim: '2026-08-22' });
    expect(linhas[0].celulas[3]).toMatchObject({ numero_fase: 8, dias_na_semana: 7 });
    // linha de 09/08 a 15/08 · F7 (08→15) pega 7 dias, F8 encosta 1 (o dia 15)
    expect(linhas[0].celulas[2]).toMatchObject({ numero_fase: 7, dias_na_semana: 7 });
    expect(linhas[0].celulas[2].transicao?.numero_fase).toBe(8);
  });
});

describe('sobreposição de dias', () => {
  it('conta inclusivo nas duas pontas', () => {
    expect(diasSobrepostos('2026-08-15', '2026-08-22', '2026-08-17', '2026-08-23')).toBe(6); // 17..22
    expect(diasSobrepostos('2026-08-22', '2026-09-05', '2026-08-17', '2026-08-23')).toBe(2); // 22..23
  });

  it('devolve 0 quando não encosta', () => {
    expect(diasSobrepostos('2026-08-01', '2026-08-08', '2026-08-17', '2026-08-23')).toBe(0);
    expect(diasSobrepostos('2026-09-01', '2026-09-08', '2026-08-17', '2026-08-23')).toBe(0);
  });

  it('um dia só de encontro conta 1 (as fases compartilham a fronteira)', () => {
    expect(diasSobrepostos('2026-08-08', '2026-08-15', '2026-08-15', '2026-08-21')).toBe(1);
  });

  it('data faltando ou invertida não sobrepõe nada', () => {
    expect(diasSobrepostos(null, '2026-08-22', '2026-08-17', '2026-08-23')).toBe(0);
    expect(diasSobrepostos('2026-08-22', '2026-08-15', '2026-08-17', '2026-08-23')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ⚠️⚠️ O CONTRATO CENTRAL: os 4 casos que o Pedro descreveu de cabeça.
// Se este bloco ficar vermelho, a tela passou a discordar de quem opera o ciclo.
// ---------------------------------------------------------------------------
describe('a fase da semana reproduz o que o Pedro descreveu (semana de 17 a 23/08)', () => {
  it('O Mundo não vai acabar → Fase 8 · Finalizações', () => {
    const r = faseDaSemana(O_MUNDO, SEMANA_QUE_VEM);
    expect(r.fase.numero_fase).toBe(8);
    expect(r.fase.nome_fase).toBe('Finalizações');
  });

  it('Divertidamente → Fase 5 · Aprovação', () => {
    const r = faseDaSemana(DIVERTIDAMENTE, SEMANA_QUE_VEM);
    expect(r.fase.numero_fase).toBe(5);
    expect(r.fase.nome_fase).toBe('Aprovação');
  });

  it('Parábolas Parabólicas → Fase 3 · Brainstorming e Conceito', () => {
    const r = faseDaSemana(PARABOLAS, SEMANA_QUE_VEM);
    expect(r.fase.numero_fase).toBe(3);
  });

  it('Dia da Reforma Protestante → Fase 3 · Brainstorming e Conceito', () => {
    const r = faseDaSemana(REFORMA, SEMANA_QUE_VEM);
    expect(r.fase.numero_fase).toBe(3);
  });

  // ⚠️ MUTATION TEST: trocar "mais dias" por "primeira que encosta" faz o
  // O Mundo virar Fase 7 (que termina no dia 15, antes da semana começar? não —
  // encosta em nada) e o Divertidamente virar Fase 4. A ordem do array não pode
  // decidir a fase.
  it('não é a primeira que encosta — é a que ocupa mais dias', () => {
    // Fase 9 encosta (22 e 23) mas só 2 dias contra os 6 da Fase 8.
    const r = faseDaSemana(O_MUNDO, SEMANA_QUE_VEM);
    expect(r.dias).toBe(6);
    expect(r.concorrentes).toBe(2);
    // Invertendo a ordem do array o resultado não muda.
    const invertido = faseDaSemana([...O_MUNDO].reverse(), SEMANA_QUE_VEM);
    expect(invertido.fase.numero_fase).toBe(8);
  });
});

describe('a virada de fase dentro da semana é DECLARADA', () => {
  it('aponta a próxima fase que já começa na mesma semana', () => {
    const r = faseDaSemana(O_MUNDO, SEMANA_QUE_VEM);
    expect(r.transicao?.fase.numero_fase).toBe(9);
    expect(r.transicao?.fase.nome_fase).toBe('Alinhamentos Operacionais Finais');
  });

  it('semana inteira dentro de uma fase não tem transição', () => {
    // Parábolas: fase 3 vai de 15/08 a 29/08 · cobre a semana toda
    const r = faseDaSemana(PARABOLAS, SEMANA_QUE_VEM);
    expect(r.dias).toBe(7);
    expect(r.transicao).toBeNull();
  });

  // ⚠️ A transição olha só pra FRENTE: a fase que está ACABANDO não é novidade.
  it('não aponta como transição a fase anterior que ainda encosta', () => {
    const r = faseDaSemana(REFORMA, SEMANA_ATUAL); // F2 (5d) domina, F3 encosta 3d
    expect(r.fase.numero_fase).toBe(2);
    expect(r.transicao?.fase.numero_fase).toBe(3);
    const r2 = faseDaSemana(DIVERTIDAMENTE, SEMANA_ATUAL); // F4 (6d) domina, F5 2d
    expect(r2.fase.numero_fase).toBe(4);
    expect(r2.transicao?.fase.numero_fase).toBe(5);
  });

  // ⚠️⚠️ O caso que realmente prende a guarda: TRÊS fases na mesma semana, com a
  // dominante sendo a ÚLTIMA. As duas anteriores encostam e já acabaram — nenhuma
  // é "o que vem", e apontar uma delas mandaria a equipe pra trás no ciclo.
  it('nunca aponta como transição uma fase de número MENOR que a escolhida', () => {
    const tresNaSemana = [
      fase(5, 'Aprovação', '2026-08-01', '2026-08-18'),           // 17, 18 → 2d
      fase(6, 'Execução Estratégica', '2026-08-18', '2026-08-19'), // 18, 19 → 2d
      fase(7, 'Pré-Testes', '2026-08-19', '2026-08-30'),           // 19..23 → 5d
    ];
    const r = faseDaSemana(tresNaSemana, SEMANA_QUE_VEM);
    expect(r.fase.numero_fase).toBe(7);
    expect(r.concorrentes).toBe(3);
    expect(r.transicao).toBeNull();
  });
});

describe('empate → vence a fase mais adiantada', () => {
  it('meio a meio na semana mostra a fase seguinte', () => {
    const meias = [
      fase(5, 'Aprovação', '2026-08-10', '2026-08-19'),
      fase(6, 'Execução Estratégica', '2026-08-20', '2026-08-26'),
    ];
    // semana 17..23: F5 pega 17,18,19 (3d) · F6 pega 20,21,22,23 (4d)
    const r = faseDaSemana(meias, SEMANA_QUE_VEM);
    expect(r.fase.numero_fase).toBe(6);

    // empate exato de 3 dias cada
    const empate = [
      fase(5, 'Aprovação', '2026-08-01', '2026-08-19'),
      fase(6, 'Execução', '2026-08-17', '2026-08-19'),
    ];
    expect(faseDaSemana(empate, SEMANA_QUE_VEM).fase.numero_fase).toBe(6);
  });
});

describe('fora do ciclo', () => {
  it('semana antes do ciclo começar não tem fase', () => {
    expect(faseDaSemana(PELOS_OLHOS, SEMANA_QUE_VEM)).toBeNull();
  });

  it('lista de fases vazia ou nula não explode', () => {
    expect(faseDaSemana([], SEMANA_QUE_VEM)).toBeNull();
    expect(faseDaSemana(null, SEMANA_QUE_VEM)).toBeNull();
  });
});

describe('grade do calendário', () => {
  const semanas = montarSemanas('2026-08-14', { retro: 0, adiante: 2 }); // 10/08, 17/08, 24/08

  it('uma linha por evento, uma célula por semana, na ordem de entrada', () => {
    const { linhas } = montarCalendario({
      eventos: [{ id: 'a', nome: 'O Mundo não vai acabar' }, { id: 'b', nome: 'Divertidamente' }],
      fasesPorEvento: { a: O_MUNDO, b: DIVERTIDAMENTE },
      semanas,
    });
    expect(linhas.map((l: any) => l.nome)).toEqual(['O Mundo não vai acabar', 'Divertidamente']);
    expect(linhas[0].celulas).toHaveLength(3);
    expect(linhas[0].celulas[1]).toMatchObject({ numero_fase: 8, nome_fase: 'Finalizações', dias_na_semana: 6 });
    expect(linhas[1].celulas[1]).toMatchObject({ numero_fase: 5, nome_fase: 'Aprovação' });
  });

  // ⚠️ GUARDA: hoje há 7 ciclos ativos e 3 só começam em setembro. Sem isso a
  // grade nasce com metade das linhas sendo sete traços.
  it('evento sem NENHUMA fase na janela fica FORA da grade', () => {
    // Janela de 10/08 a 23/08 · o Pré Briefing de "Pelos Olhos" só abre em 29/08.
    const curta = montarSemanas('2026-08-14', { retro: 0, adiante: 1 });
    const { linhas } = montarCalendario({
      eventos: [{ id: 'a', nome: 'O Mundo' }, { id: 'z', nome: 'Pelos Olhos de Quem Vê' }],
      fasesPorEvento: { a: O_MUNDO, z: PELOS_OLHOS },
      semanas: curta,
    });
    expect(linhas.map((l: any) => l.id)).toEqual(['a']);

    // ⚠️ E basta a fase encostar 2 dias na última semana pra ele ENTRAR: a régua
    // é "tem fase na janela", não "a fase cabe inteira na janela".
    const comSetembro = montarCalendario({
      eventos: [{ id: 'z', nome: 'Pelos Olhos de Quem Vê' }],
      fasesPorEvento: { z: PELOS_OLHOS },
      semanas, // vai até 30/08 · pega 29 e 30
    });
    expect(comSetembro.linhas).toHaveLength(1);
  });

  it('a semana em que o evento ainda não entrou no ciclo vira célula vazia', () => {
    const largo = montarSemanas('2026-08-14', { retro: 0, adiante: 4 }); // até 07/09
    const { linhas } = montarCalendario({
      eventos: [{ id: 'z', nome: 'Pelos Olhos' }],
      fasesPorEvento: { z: PELOS_OLHOS },
      semanas: largo,
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].celulas[0]).toMatchObject({ vazio: true });
    expect(linhas[0].celulas[2].vazio).toBe(false); // semana de 24/08 pega o Pré Briefing
  });

  // ⚠️ GUARDA: fase sem data não é posicionável, mas some do calendário — o
  // número tem que aparecer em algum lugar, senão ninguém descobre.
  it('fase sem data é CONTADA em sem_data, não descartada em silêncio', () => {
    const comBuraco = [
      ...O_MUNDO,
      { id: 'x', numero_fase: 12, nome_fase: 'Fase solta', data_inicio_prevista: null, data_fim_prevista: null },
    ];
    const r = montarCalendario({
      eventos: [{ id: 'a', nome: 'O Mundo' }],
      fasesPorEvento: { a: comBuraco },
      semanas,
    });
    expect(r.sem_data).toBe(1);
    expect(r.linhas[0].celulas[1].numero_fase).toBe(8); // a grade segue certa
  });

  it('sem eventos devolve grade vazia sem estourar', () => {
    expect(montarCalendario({}).linhas).toEqual([]);
    expect(montarCalendario({ eventos: [], fasesPorEvento: {}, semanas }).sem_data).toBe(0);
  });
});
