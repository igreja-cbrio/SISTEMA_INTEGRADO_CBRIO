// A régua ÚNICA do 1º contato no backend (16/09/2026).
//
// ⚠️⚠️ As 4 cópias do backend DIVERGIAM sobre `numero_errado`: 3 contavam como
// contato feito e 1 não. Medido em 16/09 sobre as 461 linhas vivas: 98% pela
// régua do front × 100% pela do backend, sobre o mesmo dado.
//
// A causa não era descuido: era UM SET RESPONDENDO DUAS PERGUNTAS. Para quem
// tem número errado, "a mensagem chegou?" e "ainda preciso contatar?" têm
// respostas OPOSTAS — e cada arquivo escolheu o lado de que precisava.
import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend
import {
  CONTATO_FEITO, INALCANCAVEL, ENCERRADO,
  contatoFoiFeito, ehInalcancavel, precisaDeContato,
  totalAlcancavel, pctAlcancavel,
} from '../../backend/utils/primeiroContatoRegua';

describe('as duas perguntas', () => {
  const numeroErrado = { primeiro_contato_status: 'numero_errado' };
  const impossivel = { primeiro_contato_status: 'contato_impossivel' };

  // ⚠️⚠️ É ISTO que as 4 cópias não conseguiam expressar com um Set só.
  it('número errado: a mensagem NÃO chegou, e NÃO adianta insistir', () => {
    expect(contatoFoiFeito(numeroErrado)).toBe(false);
    expect(precisaDeContato(numeroErrado)).toBe(false);
  });

  it('contato impossível: idem — é a mesma família', () => {
    expect(contatoFoiFeito(impossivel)).toBe(false);
    expect(precisaDeContato(impossivel)).toBe(false);
  });

  it('quem nunca foi marcado ainda precisa de contato', () => {
    expect(precisaDeContato({ primeiro_contato_status: null })).toBe(true);
    expect(contatoFoiFeito({ primeiro_contato_status: null })).toBe(false);
  });

  it('mensagem enviada: chegou, e não volta pra fila', () => {
    for (const v of ['contactada', 'nao_respondeu', 'nao_atendido', 'atendido_respondido']) {
      expect(contatoFoiFeito({ primeiro_contato_status: v }), v).toBe(true);
      expect(precisaDeContato({ primeiro_contato_status: v }), v).toBe(false);
    }
  });

  // ⚠️ A data legada vale sozinha — linha antiga tem carimbo e não tem status.
  it('a data de contato vale mesmo sem status', () => {
    expect(contatoFoiFeito({ primeiro_contato_em: '2026-09-01T10:00:00Z' })).toBe(true);
    expect(precisaDeContato({ primeiro_contato_em: '2026-09-01T10:00:00Z' })).toBe(false);
  });
});

describe('os conjuntos', () => {
  // ⚠️⚠️ O mutante: pôr inalcançável em CONTATO_FEITO. Volta a inflar o
  // indicador com contato que não aconteceu.
  it('inalcançável nunca é contato feito', () => {
    for (const v of INALCANCAVEL) expect(CONTATO_FEITO.has(v), v).toBe(false);
  });
  it('encerrado é a união dos dois', () => {
    expect([...ENCERRADO].sort()).toEqual([...new Set([...CONTATO_FEITO, ...INALCANCAVEL])].sort());
  });
  it('inalcançável é número errado + contato impossível', () => {
    expect([...INALCANCAVEL].sort()).toEqual(['contato_impossivel', 'numero_errado']);
  });
});

describe('o denominador', () => {
  const l = (s: string | null) => ({ primeiro_contato_status: s });

  it('tira os inalcançáveis do total', () => {
    expect(totalAlcancavel([l('contactada'), l('numero_errado'), l('contato_impossivel'), l(null)])).toBe(2);
  });

  it('lista inteira inalcançável dá 0, nunca negativo', () => {
    expect(totalAlcancavel([l('numero_errado'), l('contato_impossivel')])).toBe(0);
    expect(totalAlcancavel([])).toBe(0);
    expect(totalAlcancavel(null as any)).toBe(0);
  });

  // ⚠️⚠️ O erro que este desenho existe pra impedir: somar ao numerador E tirar
  // do denominador ao mesmo tempo daria percentual ACIMA de 100%.
  it('sem o que medir devolve null, nunca divisão por zero', () => {
    expect(pctAlcancavel(0, 3, 3)).toBe(null);
    expect(pctAlcancavel(5, 0, 0)).toBe(null);
  });

  it('o percentual sai sobre o total alcançável', () => {
    expect(pctAlcancavel(453, 461, 7)).toBe(100);   // 453 de 454
    expect(pctAlcancavel(9, 12, 2)).toBe(90);       // 9 de 10
    expect(pctAlcancavel(0, 10, 0)).toBe(0);
  });

  it('nunca passa de 100%', () => {
    // 10 alcançáveis, 10 contatados — o teto é o teto.
    expect(pctAlcancavel(10, 12, 2)).toBe(100);
  });
});
