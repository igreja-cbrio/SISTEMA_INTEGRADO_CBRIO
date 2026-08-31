// Contrato dos 3 cards da tela de Crianças do Kids + o motivo da inativação.
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. contagem que NÃO VEIO nunca virar 0 ("0 inativas" e "não deu pra contar"
//      levam a decisões opostas, e o zero é o que ninguém investiga);
//   2. `motivo_inativacao` NULO nunca virar um motivo falso na linha da criança;
//   3. o balde "sem motivo registrado" não ser descartado nem somado a outro —
//      é ele que faz a soma dos motivos fechar com o total de inativas;
//   4. ordem estável (lista que dança entre dois carregamentos iguais parece bug).
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reg = require('../../backend/utils/kidsSituacao.js');
const { rotuloMotivo, agruparMotivos, numeroOuNulo, montarContagens, MOTIVOS_DO_SISTEMA } = reg;

// Totais REAIS de produção medidos em 31/08/2026.
const PROD = { frequentadoras: 1054, visitantes: 62, inativas: 3270 };

describe('kidsSituacao · rótulo do motivo', () => {
  it('devolve o motivo limpo quando existe', () => {
    expect(rotuloMotivo('Visitante não retornou (prazo de 4 semanas)'))
      .toBe('Visitante não retornou (prazo de 4 semanas)');
    expect(rotuloMotivo('  Mudou   de cidade  ')).toBe('Mudou de cidade');
  });

  it('⚠️⚠️ AUSÊNCIA de motivo devolve NULL, nunca um texto', () => {
    expect(rotuloMotivo(null)).toBeNull();
    expect(rotuloMotivo(undefined)).toBeNull();
    expect(rotuloMotivo('')).toBeNull();
    expect(rotuloMotivo('   ')).toBeNull();
    expect(rotuloMotivo('\n\t ')).toBeNull();
  });

  it('as frases que a inativação automática grava passam intactas', () => {
    for (const m of MOTIVOS_DO_SISTEMA) expect(rotuloMotivo(m)).toBe(m);
  });
});

describe('kidsSituacao · agrupamento dos motivos', () => {
  // Amostra com as frases REAIS que o sistema grava (as contagens aqui são de
  // amostra, não os totais de produção).
  const LINHAS = [
    { motivo_inativacao: 'Sem check-in no Planning Center nos últimos 6 meses' },
    { motivo_inativacao: 'Sem check-in no Planning Center nos últimos 6 meses' },
    { motivo_inativacao: 'Sem check-in no Planning Center nos últimos 6 meses' },
    { motivo_inativacao: 'Completou 13 anos · graduou para adolescente' },
    { motivo_inativacao: 'Completou 13 anos · graduou para adolescente' },
    { motivo_inativacao: 'Visitante não retornou (prazo de 4 semanas)' },
    { motivo_inativacao: null },
    { motivo_inativacao: '' },
  ];

  it('ordena do mais frequente pro menos', () => {
    const g = agruparMotivos(LINHAS);
    expect(g[0]).toEqual({ motivo: 'Sem check-in no Planning Center nos últimos 6 meses', total: 3 });
    expect(g[1]).toEqual({ motivo: 'Completou 13 anos · graduou para adolescente', total: 2 });
  });

  it('⚠️⚠️ nulo e string vazia caem no MESMO balde de "sem motivo"', () => {
    const g = agruparMotivos(LINHAS);
    const sem = g.filter((x: any) => x.motivo === null);
    expect(sem).toHaveLength(1);
    expect(sem[0].total).toBe(2);
  });

  it('⚠️ a soma dos baldes FECHA com o total de linhas', () => {
    const g = agruparMotivos(LINHAS);
    expect(g.reduce((s: number, x: any) => s + x.total, 0)).toBe(LINHAS.length);
  });

  it('⚠️ no empate, quem TEM motivo vem antes do "sem motivo"', () => {
    const g = agruparMotivos([
      { motivo_inativacao: null },
      { motivo_inativacao: 'Cadastro duplicado' },
    ]);
    expect(g[0].motivo).toBe('Cadastro duplicado');
    expect(g[1].motivo).toBeNull();
  });

  it('⚠️ empate entre dois motivos é alfabético (ordem ESTÁVEL)', () => {
    const entrada = [{ motivo_inativacao: 'Mudou de cidade' }, { motivo_inativacao: 'Cadastro duplicado' }];
    const a = agruparMotivos(entrada).map((x: any) => x.motivo);
    const b = agruparMotivos([...entrada].reverse()).map((x: any) => x.motivo);
    expect(a).toEqual(['Cadastro duplicado', 'Mudou de cidade']);
    expect(a).toEqual(b);
  });

  it('lista vazia ou ausente devolve vazio, sem estourar', () => {
    expect(agruparMotivos([])).toEqual([]);
    expect(agruparMotivos(null)).toEqual([]);
    expect(agruparMotivos(undefined)).toEqual([]);
  });

  it('espaço sobrando NÃO parte o mesmo motivo em dois baldes', () => {
    const g = agruparMotivos([
      { motivo_inativacao: 'Cadastro duplicado' },
      { motivo_inativacao: '  Cadastro   duplicado ' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(2);
  });
});

describe('kidsSituacao · número ou nulo', () => {
  it('número válido passa (inclusive ZERO, que é medição)', () => {
    expect(numeroOuNulo(0)).toBe(0);
    expect(numeroOuNulo(3270)).toBe(3270);
  });

  it('⚠️⚠️ ausência e lixo viram NULL, nunca 0', () => {
    expect(numeroOuNulo(undefined)).toBeNull();
    expect(numeroOuNulo(null)).toBeNull();
    expect(numeroOuNulo('62')).toBeNull();
    expect(numeroOuNulo(NaN)).toBeNull();
    expect(numeroOuNulo(Infinity)).toBeNull();
    expect(numeroOuNulo(-1)).toBeNull();
  });
});

describe('kidsSituacao · os 3 cards', () => {
  it('monta os cards com os números reais de produção', () => {
    const c = montarContagens(PROD);
    expect(c.frequentadoras).toBe(1054);
    expect(c.visitantes).toBe(62);
    expect(c.inativas).toBe(3270);
    expect(c.ativas).toBe(1116);
    expect(c.incompleto).toBe(false);
  });

  it('⚠️⚠️ contagem que FALHOU fica NULL e marca incompleto — nunca 0', () => {
    const c = montarContagens({ ...PROD, inativas: undefined });
    expect(c.inativas).toBeNull();
    expect(c.incompleto).toBe(true);
    // o que veio continua valendo
    expect(c.frequentadoras).toBe(1054);
    expect(c.ativas).toBe(1116);
  });

  it('⚠️⚠️ ativas é NULL quando falta um dos dois lados (nunca soma parcial)', () => {
    expect(montarContagens({ ...PROD, visitantes: undefined }).ativas).toBeNull();
    expect(montarContagens({ ...PROD, frequentadoras: null }).ativas).toBeNull();
  });

  it('zero medido é dado: 0 visitantes não marca incompleto', () => {
    const c = montarContagens({ frequentadoras: 1054, visitantes: 0, inativas: 3270 });
    expect(c.visitantes).toBe(0);
    expect(c.ativas).toBe(1054);
    expect(c.incompleto).toBe(false);
  });

  it('payload ausente devolve tudo NULL e incompleto', () => {
    const c = montarContagens();
    expect(c).toMatchObject({ frequentadoras: null, visitantes: null, inativas: null, ativas: null, incompleto: true });
  });
});
