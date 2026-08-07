import { describe, it, expect } from 'vitest';
import { bandeiraDoBin, formatoDoCartao, NOME_BANDEIRA } from '../lib/bandeiraCartao';

// A detecção roda no BIN que o SDK do provedor entrega (6-8 dígitos). Ela só
// decide o DESENHO — quem cobra é o provedor, com o `payment_method_id` que ele
// mesmo resolve. Errar aqui não cobra errado; mostra a marca errada, que é como
// a pessoa desconfia da página no meio de um pagamento.

describe('bandeira do cartão · BIN', () => {
  it('reconhece as bandeiras globais', () => {
    expect(bandeiraDoBin('411111')).toBe('visa');
    expect(bandeiraDoBin('555566')).toBe('mastercard');
    expect(bandeiraDoBin('510000')).toBe('mastercard');
    expect(bandeiraDoBin('371449')).toBe('amex');
    expect(bandeiraDoBin('340000')).toBe('amex');
    expect(bandeiraDoBin('301234')).toBe('diners');
    expect(bandeiraDoBin('601100')).toBe('discover');
    expect(bandeiraDoBin('353011')).toBe('jcb');
  });

  it('reconhece a faixa 2-series da Mastercard (2221-2720)', () => {
    // Faixa que entrou depois e que quase todo detector antigo erra: sem ela,
    // um Mastercard novo aparece como "cartão" genérico.
    expect(bandeiraDoBin('222100')).toBe('mastercard');
    expect(bandeiraDoBin('272000')).toBe('mastercard');
    // Fora da faixa não pode virar Mastercard.
    expect(bandeiraDoBin('222000')).not.toBe('mastercard');
    expect(bandeiraDoBin('272100')).not.toBe('mastercard');
  });

  it('⚠️ Elo vence Visa e Mastercard — ele mora DENTRO das faixas delas', () => {
    // É o erro que passa despercebido: `401178` começa com 4 e `506699` começa
    // com 5. Testar Visa/Master antes faz um Elo brasileiro aparecer como Visa.
    expect(bandeiraDoBin('401178')).toBe('elo');
    expect(bandeiraDoBin('401179')).toBe('elo');
    expect(bandeiraDoBin('431274')).toBe('elo');
    expect(bandeiraDoBin('504175')).toBe('elo');
    expect(bandeiraDoBin('506700')).toBe('elo');  // dentro de 506699-506778
    expect(bandeiraDoBin('650035')).toBe('elo');
    expect(bandeiraDoBin('655030')).toBe('elo');  // dentro de 655021-655058
    // Vizinho de fora da faixa continua Visa/Mastercard.
    expect(bandeiraDoBin('401177')).toBe('visa');
    // ⚠️ Vizinho de fora da faixa do Elo em `50` fica SEM bandeira, e é
    // deliberado: `50` é território de Aura/Elo, não de Mastercard (51-55).
    expect(bandeiraDoBin('506698')).toBeNull();
  });

  it('reconhece os cartões de TESTE do provedor', () => {
    // `503143` não é faixa real de Mastercard (51-55 e 2221-2720) — existe só no
    // sandbox. Sem a lista, quem testa a integração vê "CARTÃO" genérico e
    // conclui que a detecção está quebrada. Nenhum cartão real usa esses
    // prefixos, então isto não pode causar marca errada em produção.
    expect(bandeiraDoBin('503143')).toBe('mastercard');
    expect(bandeiraDoBin('423564')).toBe('visa');
    expect(bandeiraDoBin('501105')).toBe('elo');
  });

  it('reconhece Hipercard nas duas formas', () => {
    expect(bandeiraDoBin('606282')).toBe('hipercard');
    expect(bandeiraDoBin('384100')).toBe('hipercard');
  });

  it('devolve null enquanto não dá pra decidir, em vez de chutar', () => {
    // Mostrar uma marca e trocá-la no dígito seguinte é pior que não mostrar.
    expect(bandeiraDoBin('')).toBeNull();
    expect(bandeiraDoBin(null)).toBeNull();
    expect(bandeiraDoBin(undefined)).toBeNull();
    expect(bandeiraDoBin('4')).toBeNull();
    expect(bandeiraDoBin('41')).toBeNull();
  });

  it('ignora o que não é dígito (o SDK pode mandar formatado)', () => {
    expect(bandeiraDoBin('4111 11')).toBe('visa');
    expect(bandeiraDoBin('5555-66')).toBe('mastercard');
  });

  it('BIN de 8 dígitos não muda a decisão dos 6 primeiros', () => {
    expect(bandeiraDoBin('55556677')).toBe('mastercard');
    expect(bandeiraDoBin('40117800')).toBe('elo');
  });

  it('toda bandeira detectável tem nome para leitor de tela', () => {
    const detectadas = ['visa', 'mastercard', 'amex', 'elo', 'hipercard', 'diners', 'discover', 'jcb'] as const;
    for (const b of detectadas) {
      expect(NOME_BANDEIRA[b], `sem nome para ${b}`).toBeTruthy();
    }
  });

  it('o formato do desenho acompanha a bandeira', () => {
    // Amex tem 15 dígitos em 4-6-5 e Diners 14 — desenhar 4x4 deixaria caixinha
    // vazia sobrando no cartão.
    expect(formatoDoCartao('amex')).toEqual({ grupos: [4, 6, 5], total: 15 });
    expect(formatoDoCartao('diners')).toEqual({ grupos: [4, 6, 4], total: 14 });
    expect(formatoDoCartao('visa')).toEqual({ grupos: [4, 4, 4, 4], total: 16 });
    expect(formatoDoCartao(null)).toEqual({ grupos: [4, 4, 4, 4], total: 16 });
  });
});
