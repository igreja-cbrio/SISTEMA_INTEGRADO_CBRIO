// Quando a conciliação balanço × OFX pode PERGUNTAR ao humano.
//
// ⚠️⚠️ O caso que originou isto (02/09/2026): a tela mostrava
// "Ana Magalhaes da Veiga Ribeiro · R$ 1.000 · 05/06" e oferecia como candidatos
// CARLOS FABIANO TERRIGNO, SONIA MARIA RIBEIRO SALGADO e JULIANA BITTENCOURT
// GONZAGA. O Matheus perguntou: "como vou saber quem foi?". Não havia como —
// a máquina JÁ tinha testado o nome exato e falhado, e mesmo assim pedia a
// escolha. Qualquer clique atribuiria R$ 1.000 da Ana a outra pessoa.
//
// Medido no período que tinha extrato: dos 627 casos que iam para revisão,
// **428 (68%) não tinham NENHUM candidato com nome compatível**.
//
// A régua é `duplicidadePolicy.nomesPodemSerMesmaPessoa` (mesmo PRIMEIRO nome +
// ≥75% dos tokens do menor) — a mesma que resolveu o telefone do voluntário em
// 13/08. Este arquivo guarda o CONTRATO: o que ela precisa aceitar e o que
// precisa recusar quando o que está em jogo é atribuir dinheiro a uma pessoa.
import { describe, it, expect } from 'vitest';
import { nomesPodemSerMesmaPessoa } from '../../backend/services/duplicidadePolicy';

describe('nome compatível para atribuir doação', () => {
  it('⚠️ o caso da Ana: nenhum dos candidatos é ela', () => {
    const bal = 'Ana Magalhaes da Veiga Ribeiro';
    for (const cand of [
      'CARLOS FABIANO TERRIGNO',
      'SONIA MARIA RIBEIRO SALGADO',   // compartilha "RIBEIRO", e NÃO basta
      'JULIANA BITTENCOURT GONZAGA',
    ]) {
      expect(nomesPodemSerMesmaPessoa(bal, cand)).toBe(false);
    }
  });

  it('aceita a forma abreviada — o balanço tem o nome civil, o banco o curto', () => {
    expect(nomesPodemSerMesmaPessoa('Ana Magalhaes da Veiga Ribeiro', 'ANA MAGALHAES RIBEIRO')).toBe(true);
    expect(nomesPodemSerMesmaPessoa('WAGNER OLIVEIRA DA SILVA', 'Wagner Oliveira Silva')).toBe(true);
  });

  it('ignora acento e caixa — o extrato vem em maiúsculas sem acento', () => {
    expect(nomesPodemSerMesmaPessoa('Jonatas Lima dos Santos', 'JONATAS LIMA DOS SANTOS')).toBe(true);
    expect(nomesPodemSerMesmaPessoa('Regia Mara do Nascimento Larios', 'RÉGIA MARA DO NASCIMENTO LARIOS')).toBe(true);
  });

  it('⚠️ sobrenome em comum NÃO é a mesma pessoa — é família', () => {
    // O erro mais caro possível aqui: atribuir a doação do marido à esposa.
    expect(nomesPodemSerMesmaPessoa('Ana Souza Lima', 'Joao Souza Lima')).toBe(false);
    expect(nomesPodemSerMesmaPessoa('Patricia Porto Vezo', 'Ricardo Porto Vezo')).toBe(false);
  });

  it('⚠️ primeiro nome igual e resto diferente NÃO basta', () => {
    expect(nomesPodemSerMesmaPessoa('Carlos Alberto Nascimento', 'Carlos Fabiano Terrigno')).toBe(false);
  });

  it('nome vazio nunca casa', () => {
    expect(nomesPodemSerMesmaPessoa('', 'ANA MAGALHAES')).toBe(false);
    expect(nomesPodemSerMesmaPessoa('ANA MAGALHAES', '')).toBe(false);
  });
});
