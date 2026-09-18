// Como o valor de um KPI tático é escrito na tela.
//
// ⚠️⚠️ O caso que originou isto (02/09/2026): o card "Valor total arrecadado no
// ciclo" mostrava **871406** no Dashboard Semanal, e o Matheus perguntou o que
// era. Sem R$, sem separador de milhar. O componente tratava só '%'.
// A unidade JÁ ESTAVA CERTA no banco (`unidade = 'R$'`) — era a tela que não
// lia o que o dado dizia.
//
// ⚠️ O card aparece em SEIS telas, então a régua vale para todas — e para as
// 10 unidades que o banco realmente usa (medidas no mesmo dia):
//   null 97 · % 46 · nota 18 · # 4 · pessoas 3 · ocorrências 2 · views 2
//   · dias 1 · R$ 1 · cards 1
import { describe, it, expect } from 'vitest';
import { formatarValorKpi, formatarMetaKpi } from '@/lib/formatoKpi';

// ⚠️⚠️ O `Intl` do pt-BR separa "R$" do número com ESPAÇO NÃO-QUEBRÁVEL
// (U+00A0), não com espaço comum. As duas strings parecem idênticas na tela e
// no diff do teste ("expected `${R$_}871.406` to be `${R$_}871.406`"), e o assert
// falha. O NBSP é DESEJÁVEL — é ele que impede o "R$" de ficar sozinho no fim
// da linha —, então quem estava errado era o teste, não o código.
const R$_ = 'R$\u00A0';

describe('⚠️⚠️ o caso do print: R$ 871.406, não 871406', () => {
  it('unidade R$ vira moeda com separador', () => {
    expect(formatarValorKpi(871406, 'R$')).toBe(`${R$_}871.406`);
  });

  it('⚠️ sem centavos quando é inteiro (é o número que se fala em voz alta)', () => {
    expect(formatarValorKpi(871406, 'R$')).not.toContain(',');
  });

  it('⚠️ COM centavos quando eles existem — truncar esconderia diferença real', () => {
    expect(formatarValorKpi(1234.5, 'R$')).toBe(`${R$_}1.234,50`);
    expect(formatarValorKpi(391.88, 'R$')).toBe(`${R$_}391,88`);
  });

  it('aceita as grafias que o banco pode ter', () => {
    for (const u of ['R$', 'r$', 'BRL', 'reais']) {
      expect(formatarValorKpi(1000, u)).toBe(`${R$_}1.000`);
    }
  });
});

describe('as outras 9 unidades que existem no banco', () => {
  it('percentual mantém 1 casa quando ela existe, e some quando é inteiro', () => {
    expect(formatarValorKpi(30, '%')).toBe('30%');
    expect(formatarValorKpi(28.1, '%')).toBe('28,1%');
    expect(formatarValorKpi(0, '%')).toBe('0%');
  });

  it('⚠️ sem unidade (97 KPIs) ganha separador de milhar — era o outro lado do bug', () => {
    expect(formatarValorKpi(871406, null)).toBe('871.406');
    expect(formatarValorKpi(1500, undefined)).toBe('1.500');
  });

  it('unidade textual vira sufixo', () => {
    expect(formatarValorKpi(3437, 'pessoas')).toBe('3.437 pessoas');
    expect(formatarValorKpi(12, 'dias')).toBe('12 dias');
    expect(formatarValorKpi(2, 'ocorrências')).toBe('2 ocorrências');
    expect(formatarValorKpi(20000, 'views')).toBe('20.000 views');
    expect(formatarValorKpi(5, 'cards')).toBe('5 cards');
  });

  it('⚠️ `#` e `nota` NÃO viram sufixo ("12 #" e "9 nota" não se leem)', () => {
    expect(formatarValorKpi(12, '#')).toBe('12');
    expect(formatarValorKpi(9.7, 'nota')).toBe('9,7');
  });
});

describe('⚠️ ausência NUNCA vira zero', () => {
  it('nulo, vazio e ilegível devolvem travessão', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity]) {
      expect(formatarValorKpi(v, 'R$')).toBe('—');
    }
  });

  it('⚠️⚠️ mas ZERO MEDIDO é zero, não travessão', () => {
    // "não há dado" e "o valor é zero" levam a decisões opostas.
    expect(formatarValorKpi(0, '%')).toBe('0%');
    expect(formatarValorKpi(0, 'R$')).toBe(`${R$_}0`);
    expect(formatarValorKpi(0, null)).toBe('0');
  });

  it('string numérica é aceita (o backend às vezes manda texto)', () => {
    expect(formatarValorKpi('871406', 'R$')).toBe(`${R$_}871.406`);
  });
});

describe('a meta é escrita do MESMO jeito que o valor', () => {
  it('senão "871406 · meta 30" fica ilegível — era o que estava na tela', () => {
    expect(formatarMetaKpi(30, '%')).toBe('meta 30%');
    expect(formatarMetaKpi(500000, 'R$')).toBe(`meta ${R$_}500.000`);
  });

  it('meta ausente não vira texto', () => {
    expect(formatarMetaKpi(null, '%')).toBeNull();
    expect(formatarMetaKpi('', 'R$')).toBeNull();
    expect(formatarMetaKpi('xx', 'R$')).toBeNull();
  });

  it('⚠️ meta ZERO é meta válida, não ausência', () => {
    expect(formatarMetaKpi(0, 'ocorrências')).toBe('meta 0 ocorrências');
  });
});
