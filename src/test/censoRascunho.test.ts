// ============================================================================
// Contrato: o rascunho do censo só volta pra QUEM O ESCREVEU (25/08/2026)
//
// ⚠️⚠️ POR QUE ESTE TESTE EXISTE — é privacidade, não conveniência.
// O rascunho era aplicado na abertura pra qualquer pessoa, com o aviso
// "recuperamos o que VOCÊ já havia preenchido". Em aparelho compartilhado a
// pessoa seguinte via CPF, nome, e-mail, telefone e nascimento de quem
// preencheu antes — e podia enviar a resposta sob o CPF alheio.
//
// Medido em produção: 5 rascunhos via QR em 12 minutos, cada um durando 16 a 54
// SEGUNDOS e chegando ao servidor com 18 a 26 campos. Ninguém digita 25 campos
// em 26 segundos.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { podeAplicarRascunho, soDigitos } from '@/lib/censoRascunho';

describe('censoRascunho · o rascunho só volta pro dono', () => {
  it('máscara não atrapalha: compara só dígitos', () => {
    expect(soDigitos('123.456.789-09')).toBe('12345678909');
    expect(podeAplicarRascunho('123.456.789-09', '12345678909')).toBe(true);
    expect(podeAplicarRascunho('12345678909', '123.456.789-09')).toBe(true);
  });

  it('CPF diferente NÃO recupera — é o caso do aparelho compartilhado', () => {
    expect(podeAplicarRascunho('12345678909', '98765432100')).toBe(false);
  });

  // ⚠️ O buraco por outro caminho: aceitar prefixo faria o rascunho aparecer
  // enquanto a próxima pessoa ainda está digitando os primeiros números.
  it('prefixo NÃO basta — exige os 11 dígitos', () => {
    expect(podeAplicarRascunho('12345678909', '123')).toBe(false);
    expect(podeAplicarRascunho('12345678909', '1234567890')).toBe(false);
    expect(podeAplicarRascunho('12345678909', '12345678909')).toBe(true);
  });

  // ⚠️ Rascunho abandonado antes da pergunta 1 não tem dono: não há jeito
  // seguro de saber de quem é, então nunca volta pra tela.
  it('rascunho sem dono nunca é aplicado', () => {
    expect(podeAplicarRascunho(null, '12345678909')).toBe(false);
    expect(podeAplicarRascunho('', '12345678909')).toBe(false);
    expect(podeAplicarRascunho(undefined, '12345678909')).toBe(false);
    expect(podeAplicarRascunho('123', '12345678909')).toBe(false);
  });

  it('sem CPF digitado, nada volta', () => {
    expect(podeAplicarRascunho('12345678909', '')).toBe(false);
    expect(podeAplicarRascunho('12345678909', null)).toBe(false);
  });
});
