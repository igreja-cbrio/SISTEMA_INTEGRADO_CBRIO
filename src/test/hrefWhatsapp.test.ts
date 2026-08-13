import { describe, it, expect } from 'vitest';
import { hrefWhatsapp } from '@/lib/conversas';

// O `55` CONDICIONAL é a regra frágil aqui: prefixar sempre foi o que transformou
// um número suíço (+41 76 576 45 38) num número inexistente de Curitiba
// (5541765764538) no lançamento dos grupos. Guarda mutation-testada.

describe('hrefWhatsapp · 55 só quando o número é BR sem código de país', () => {
  it('celular com DDD (11 dígitos) ganha o 55', () => {
    expect(hrefWhatsapp('21999998888')).toBe('https://wa.me/5521999998888');
  });

  it('fixo com DDD (10 dígitos) ganha o 55', () => {
    expect(hrefWhatsapp('2133334444')).toBe('https://wa.me/552133334444');
  });

  it('número que JÁ tem código de país não ganha outro 55', () => {
    expect(hrefWhatsapp('5521999998888')).toBe('https://wa.me/5521999998888');
  });

  it('número com 12-13 dígitos é preservado (já tem país)', () => {
    expect(hrefWhatsapp('351912345678')).toBe('https://wa.me/351912345678');
  });

  // LIMITAÇÃO DOCUMENTADA, não um comportamento desejado: estrangeiro de 11
  // dígitos é indistinguível de celular BR e leva o 55. É o caso real do suíço
  // 41765764538 do lançamento dos grupos — e `41` é DDD legítimo de Curitiba,
  // então nem lista de DDD resolve. Este teste existe pra que, no dia em que
  // alguém guardar o código de país separado na entrada, a mudança seja
  // CONSCIENTE (o teste quebra e se atualiza junto), não acidental.
  it('estrangeiro de 11 dígitos AINDA leva 55 · gap conhecido', () => {
    expect(hrefWhatsapp('41765764538')).toBe('https://wa.me/5541765764538');
  });

  it('limpa máscara, parênteses, espaço e hífen', () => {
    expect(hrefWhatsapp('(21) 99999-8888')).toBe('https://wa.me/5521999998888');
    expect(hrefWhatsapp('+55 21 99999-8888')).toBe('https://wa.me/5521999998888');
  });

  it('curto demais devolve null (o chamador esconde o botão)', () => {
    expect(hrefWhatsapp('996013179')).toBeNull();   // 9 dígitos · sem DDD
    expect(hrefWhatsapp('99998888')).toBeNull();
    expect(hrefWhatsapp('')).toBeNull();
    expect(hrefWhatsapp(null)).toBeNull();
    expect(hrefWhatsapp(undefined)).toBeNull();
  });

  it('aceita número em vez de string', () => {
    expect(hrefWhatsapp(21999998888)).toBe('https://wa.me/5521999998888');
  });

  it('texto opcional vai encodado', () => {
    expect(hrefWhatsapp('21999998888', 'Olá, tudo bem?'))
      .toBe('https://wa.me/5521999998888?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  });
});
