import { describe, it, expect } from 'vitest';
import { conferirCobertura, textoDivergencia } from '../lib/coberturaDecisoes';

/**
 * Casos REAIS de produção, medidos em 15/09/2026. Não são exemplos inventados:
 * cada um é um culto que existe, e o primeiro é o que prova por que a
 * conferência precisa ser POR TIPO.
 */
describe('conferirCobertura · nome × número por tipo', () => {
  // ⚠️⚠️ O CASO QUE JUSTIFICA A RÉGUA · 13/09, Domingo 11:30.
  // Somando os tipos, o gap é 7 e a tela mostrava 7. A falta REAL de nomes
  // presenciais é 8 — a sobra de 1 nome online cancelou. É o mesmo defeito de
  // sinal que o card já evitava ENTRE cultos, acontecendo por TIPO dentro de um.
  it('a sobra de um tipo NÃO cancela a falta do outro', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 8, declaradoOnline: 1,
      nomesPresencial: 0, nomesOnline: 2,
    });
    expect(cob.presencial.faltamNomes).toBe(8);   // a falta real, não 7
    expect(cob.online.sobramNomes).toBe(1);
    expect(cob.divergentes).toHaveLength(2);
  });

  // 13/09 Domingo 19:00 · 3 nomes online, número online ZERO.
  // As 3 aparecem na jornada/NSM e somem do KPI de conversão online.
  it('nome online sem número nenhum é divergência declarada', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 0, declaradoOnline: 0,
      nomesPresencial: 0, nomesOnline: 3,
    });
    expect(cob.nomesOnlineSemNumero).toBe(true);
    expect(cob.online.sobramNomes).toBe(3);
    expect(cob.presencial.gap).toBe(0);
  });

  // ⚠️ 13/09 Domingo 09:30 · o número online é 1 (veio do formulário) e há 3
  // nomes. Não é "o número está zerado" — duas pessoas seguem invisíveis. Por
  // isso a régua olha a SOBRA, não `declarado === 0`.
  it('número online parcial ainda deixa nome de fora', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 7, declaradoOnline: 1,
      nomesPresencial: 7, nomesOnline: 3,
    });
    expect(cob.nomesOnlineSemNumero).toBe(true);
    expect(cob.online.sobramNomes).toBe(2);
    expect(cob.presencial.gap).toBe(0);
  });

  // 02/08 Domingo 11:30 · os dois lados batem nos dois tipos.
  it('tudo conferido não vira divergência', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 4, declaradoOnline: 0,
      nomesPresencial: 4, nomesOnline: 0,
    });
    expect(cob.divergentes).toHaveLength(0);
    expect(cob.nomesOnlineSemNumero).toBe(false);
    expect(textoDivergencia(cob)).toBeNull();
  });

  // 02/08 Domingo 10:00 · 3 declaradas online e nenhum nome — o buraco
  // clássico, que continua sendo cobrado.
  it('número online sem nome continua sendo falta de nome', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 1, declaradoOnline: 3,
      nomesPresencial: 1, nomesOnline: 0,
    });
    expect(cob.online.faltamNomes).toBe(3);
    expect(cob.nomesOnlineSemNumero).toBe(false); // falta nome, não sobra
  });

  // ⚠️ "Não lançado" e "lançou zero" pesam igual: nos dois casos não há número
  // cobrindo aquele nome, e a pessoa fica fora do KPI do mesmo jeito.
  it('null e undefined contam como zero', () => {
    const cob = conferirCobertura({
      declaradoPresencial: null, declaradoOnline: undefined,
      nomesPresencial: 0, nomesOnline: 2,
    });
    expect(cob.online.sobramNomes).toBe(2);
    expect(cob.nomesOnlineSemNumero).toBe(true);
  });

  // ⚠️ Valor negativo ou lixo não pode virar gap fantasma: o campo é numérico
  // na tela, mas o payload vem de JSON.
  it('valor inválido não fabrica divergência', () => {
    const cob = conferirCobertura({
      declaradoPresencial: -5, declaradoOnline: NaN as unknown as number,
      nomesPresencial: 0, nomesOnline: 0,
    });
    expect(cob.divergentes).toHaveLength(0);
  });
});

describe('textoDivergencia', () => {
  // ⚠️⚠️ A frase tem de dizer O QUE FAZER. "Divergência detectada" manda a
  // pessoa procurar; o número online não é digitável no campo óbvio (ele vem do
  // formulário ou do campo do chat), então o texto nomeia onde se resolve.
  it('no caso do nome online sem número, aponta o campo certo', () => {
    const t = textoDivergencia(conferirCobertura({
      declaradoPresencial: 0, declaradoOnline: 0,
      nomesPresencial: 0, nomesOnline: 3,
    }))!;
    expect(t).toContain('Online · chat e outros');
    expect(t).toContain('não soma sozinho');
    expect(t).toContain('3');
  });

  it('cobra nome faltando quando o número é maior', () => {
    const t = textoDivergencia(conferirCobertura({
      declaradoPresencial: 8, declaradoOnline: 0,
      nomesPresencial: 2, nomesOnline: 0,
    }))!;
    expect(t).toContain('6');
    expect(t).toContain('presencial');
  });

  // A tela mostra as duas frases quando os dois tipos divergem — somar os
  // problemas num número só é o que escondia a falta presencial.
  it('declara os dois tipos quando os dois divergem', () => {
    const t = textoDivergencia(conferirCobertura({
      declaradoPresencial: 8, declaradoOnline: 1,
      nomesPresencial: 0, nomesOnline: 2,
    }))!;
    expect(t).toContain('online');
    expect(t).toContain('presencial');
    expect(t).toContain('8');
  });

  it('singular e plural', () => {
    const um = textoDivergencia(conferirCobertura({
      declaradoPresencial: 0, declaradoOnline: 0, nomesPresencial: 0, nomesOnline: 1,
    }))!;
    expect(um).toContain('1 nome online cadastrado não está');
    expect(um).not.toContain('nomes online cadastrados');
  });
});
