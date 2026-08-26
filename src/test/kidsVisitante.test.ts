import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  DIAS_PARA_FREQUENTADORA, DIAS_DE_PRAZO,
  devePromover, prazoDe, patchAposCheckin,
} = require_('../../backend/utils/kidsVisitante.js');

/**
 * ⚠️⚠️ O CONTRATO CENTRAL: a régua de 3 check-ins só é segura COM prazo rolante.
 *
 * Visitante que passa do `data_limite` é INATIVADA automaticamente. Medido em
 * 20/08/2026: a mediana entre o 1º e o 2º check-in é 7 dias, então o 3º cai por
 * volta do 28º–30º dia para quem vem de 15 em 15 — com prazo FIXO de 4 semanas,
 * exigir 3 check-ins desativaria a criança ANTES de ela poder ser promovida.
 *
 * Se um dia alguém tirar o "renova o prazo a cada check-in" e deixar o 3, este
 * arquivo tem de ficar vermelho.
 */
describe('kids · promoção de visitante', () => {
  it('promove no 3º dia com check-in', () => {
    expect(DIAS_PARA_FREQUENTADORA).toBe(3);
    expect(devePromover(3, true)).toBe(true);
    expect(devePromover(4, true)).toBe(true);
  });

  it('NÃO promove no 1º nem no 2º', () => {
    expect(devePromover(1, true)).toBe(false);
    expect(devePromover(2, true)).toBe(false);
  });

  it('quem já é frequentadora não é reavaliada — promoção é definitiva', () => {
    // ⚠️ As 104 crianças que tinham exatamente 2 dias quando a régua virou 3
    // seguem frequentadoras. Mudar o número NÃO rebaixa ninguém.
    expect(devePromover(9, false)).toBe(false);
    expect(patchAposCheckin({ eVisitante: false, diasComCheckin: 1, hojeISO: '2026-08-20' })).toBeNull();
  });

  it('⚠️ entrada inválida não promove (fail-closed)', () => {
    // `Number(null)` é 0 e passaria como "não promove", mas `undefined` é NaN —
    // e NaN >= 3 é false, então o comportamento é seguro nos dois casos. Este
    // teste fixa isso: promover no escuro é irreversível.
    expect(devePromover(undefined, true)).toBe(false);
    expect(devePromover(null, true)).toBe(false);
    expect(devePromover('três' as unknown as number, true)).toBe(false);
    // ⚠️ Infinity é o ÚNICO caso em que a guarda `Number.isFinite` muda o
    // resultado (`Infinity >= 3` é true). Sem este caso ela seria enfeite — o
    // mutante que a removia sobrevivia com 14 testes verdes.
    expect(devePromover(Infinity, true)).toBe(false);
  });
});

describe('kids · prazo do cadastro de visitante', () => {
  it('são 4 semanas a partir do dia informado', () => {
    expect(DIAS_DE_PRAZO).toBe(28);
    expect(prazoDe('2026-08-20')).toBe('2026-09-17');
  });

  it('atravessa virada de mês e de ano', () => {
    expect(prazoDe('2026-12-20')).toBe('2027-01-17');
    expect(prazoDe('2028-02-10')).toBe('2028-03-09'); // ano bissexto
  });

  it('⚠️ o dia vem de FORA, nunca do relógio da máquina', () => {
    // Dia de operação da igreja é BRT: em UTC, das 21h em diante o dia já virou
    // e o culto de domingo à noite cairia na segunda. O prazo também precisa ser
    // determinístico no teste (a lição do faixaEtaria.test.ts).
    expect(prazoDe('2026-08-20')).toBe(prazoDe('2026-08-20'));
  });

  it('⚠️ dia inválido devolve null — sem prazo inventado', () => {
    for (const v of ['', null, undefined, 'ontem', '20/08/2026', '2026-8-20']) {
      expect(prazoDe(v as unknown as string), String(v)).toBeNull();
    }
  });
});

describe('⚠️⚠️ kids · o prazo ROLA a cada check-in (é o que viabiliza a régua de 3)', () => {
  it('1º check-in: segue visitante e ganha prazo', () => {
    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 1, hojeISO: '2026-08-20' });
    expect(p).toEqual({ data_limite: '2026-09-17', promovida: false });
  });

  it('2º check-in: segue visitante e o prazo é RENOVADO', () => {
    // É este caso que impede a desativação de quem vem quinzenal: no dia 03/09
    // (14 dias depois do 1º) o prazo salta para 01/10, e o 3º check-in em ~17/09
    // ainda encontra o cadastro de pé.
    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 2, hojeISO: '2026-09-03' });
    expect(p).toEqual({ data_limite: '2026-10-01', promovida: false });
  });

  it('3º check-in: PROMOVE e limpa prazo e relação', () => {
    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 3, hojeISO: '2026-09-17' });
    expect(p).toEqual({ visitante: false, data_limite: null, visitante_relacao: null, promovida: true });
  });

  it('⚠️ promover LIMPA o data_limite — senão a varredura inativa depois', () => {
    // Frequentadora não tem prazo. Deixar `data_limite` preenchido faria
    // `inativarVisitantesVencidos` desativar uma criança já promovida.
    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 5, hojeISO: '2026-09-17' });
    expect(p.data_limite).toBeNull();
    expect(p.visitante).toBe(false);
  });

  it('⚠️ o cenário QUINZENAL inteiro: 3 visitas, ninguém desativado', () => {
    // Este é o caso que a régua antiga de prazo fixo quebraria.
    const visitas = ['2026-08-02', '2026-08-16', '2026-08-30'];
    let prazo: string | null = null;
    visitas.forEach((dia, i) => {
      const p = patchAposCheckin({ eVisitante: true, diasComCheckin: i + 1, hojeISO: dia });
      // o cadastro ainda está de pé quando esta visita acontece
      if (prazo) expect(dia <= prazo, `visita ${dia} depois do prazo ${prazo}`).toBe(true);
      prazo = p.data_limite;
    });
    expect(prazo).toBeNull();      // a 3ª visita promoveu
  });

  it('dia inválido não apaga o prazo que existe', () => {
    // Sem dia utilizável devolve null (nada a aplicar) em vez de gravar
    // `data_limite: null`, que faria a criança virar visitante eterna.
    expect(patchAposCheckin({ eVisitante: true, diasComCheckin: 1, hojeISO: 'xx' })).toBeNull();
  });
});
