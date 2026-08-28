// Contrato do DS pós-live (Matheus · 26/08/2026).
// ⚠️ Os números são os REAIS de produção lidos em 26/08 — se algum caso ficar
// vermelho, o indicador mudou de significado para quem já leu o relatório.
import { describe, it, expect } from 'vitest';
import { calcularDs, maiorViewCount, inteiro } from '../../backend/utils/dsOnline.js';

describe('DS online · views depois que a live acabou', () => {
  it('⚠️ subtrai as views da live — o defeito que originou o pedido', () => {
    // Culto de 23/08 19:00: DS gravado era 1.355 (acumulado da vida do vídeo).
    expect(calcularDs({ viewCountD1: 1355, viewsLive: 520 })).toEqual({ ds: 835, regra: 'pos_live' });
  });

  it('⚠️ sem views da live cai no ACUMULADO e DIZ que caiu', () => {
    // O viewCount do fim de uma live encerrada é IRRECUPERÁVEL — todo culto
    // anterior à mudança só pode ser lido pela régua velha.
    expect(calcularDs({ viewCountD1: 1355 })).toEqual({ ds: 1355, regra: 'acumulado' });
    expect(calcularDs({ viewCountD1: 1355, viewsLive: null })).toEqual({ ds: 1355, regra: 'acumulado' });
  });

  it('⚠️ NUNCA devolve negativo (o YouTube revisa a contagem para baixo)', () => {
    // DS negativo viraria SUBTRAÇÃO no somatório da semana — o dashboard
    // passaria a descontar audiência de outro culto.
    expect(calcularDs({ viewCountD1: 500, viewsLive: 520 }).ds).toBe(0);
    expect(calcularDs({ viewCountD1: 0, viewsLive: 900 }).ds).toBe(0);
  });

  it('sem acumulado do dia seguinte não afirma nada', () => {
    expect(calcularDs({ viewCountD1: null, viewsLive: 520 })).toEqual({ ds: null, regra: 'sem_dado' });
    expect(calcularDs({})).toEqual({ ds: null, regra: 'sem_dado' });
  });

  it('⚠️ zero de views da live é DADO, não ausência', () => {
    // `0` é falsy — tratar como ausente devolveria a régua antiga em silêncio.
    expect(calcularDs({ viewCountD1: 900, viewsLive: 0 })).toEqual({ ds: 900, regra: 'pos_live' });
  });

  it('aceita o texto que a Data API devolve', () => {
    expect(calcularDs({ viewCountD1: '1355', viewsLive: '520' })).toEqual({ ds: 835, regra: 'pos_live' });
  });

  it('valor absurdo não vira número', () => {
    expect(inteiro(-5)).toBeNull();
    expect(inteiro('abc')).toBeNull();
    expect(inteiro(NaN)).toBeNull();
    expect(inteiro('')).toBeNull();
  });

  it('⚠️ views da live é o MAIOR amostrado, não o último', () => {
    // Amostra fora de ordem ou contagem revisada para baixo não pode reduzir.
    expect(maiorViewCount(480, 310)).toBe(480);
    expect(maiorViewCount(200, 480)).toBe(480);
    expect(maiorViewCount(null, 200)).toBe(200);
    expect(maiorViewCount(480, null)).toBe(480);
    expect(maiorViewCount(null, null)).toBeNull();
  });

  it('⚠️ pico simultâneo e views são grandezas DIFERENTES', () => {
    // 23/08 19:00: pico 300, DS 1.355. Se algum dia a régua tratar o pico como
    // views (foi a confusão que originou tudo), este caso fica vermelho.
    const { ds } = calcularDs({ viewCountD1: 1355, viewsLive: 300 });
    expect(ds).toBe(1055);
    expect(ds).not.toBe(1355 - 1355);
  });
});
