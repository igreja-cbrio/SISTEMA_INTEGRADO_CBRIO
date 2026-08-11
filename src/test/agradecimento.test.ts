import { describe, it, expect } from 'vitest';
import { ehSoAgradecimento } from '../../backend/utils/agradecimento.js';

// O que está em teste: o bot CALAR quando a pessoa só agradece um disparo, e
// continuar ABRINDO o menu para quem quer falar com a igreja.
//
// ⚠️ Os dois lados vêm das mensagens REAIS de entrada dos últimos 30 dias, com a
// frequência medida no banco. Errar para um lado enche o inbox de conversas que
// ninguém precisa atender; errar para o outro deixa gente sem atendimento.

describe('só agradecimento · o bot cala', () => {
  const casos = [
    'obrigada', 'obrigado', 'Obrigado',        // as 3 formas que apareceram
    'obrigada 🙏', 'olá,.. obrigada ☺️',
    'boa noite obrigada',                       // saudação + agradecimento
    'boa tarde!\nok.\nagradeço',                // três linhas, nenhuma com assunto
    'Muito obrigado pela atenção',
    'ok', 'ok!', 'blz', 'tmj', 'entendi',
    'Amém', 'Deus abençoe', 'Gratidão',
  ];
  for (const t of casos) {
    it(`cala em ${JSON.stringify(t)}`, () => expect(ehSoAgradecimento(t)).toBe(true));
  }

  it('emoji sozinho de gratidão conta (🙏 foi a resposta mais comum: 7 vezes)', () => {
    expect(ehSoAgradecimento('🙏🏻')).toBe(true);
    expect(ehSoAgradecimento('🙏🏼')).toBe(true);
    expect(ehSoAgradecimento('🥰🙏🏻')).toBe(true);
    expect(ehSoAgradecimento('❤️')).toBe(true);
  });
});

describe('⚠️ o menu CONTINUA abrindo', () => {
  const casos = [
    // O "oi" é o caminho que a própria cortesia ensina. Se ele fosse engolido,
    // a pessoa não teria mais como falar com a igreja.
    'oi', 'olá', 'Oi', 'bom dia', 'boa tarde', 'boa noite',
    // Pergunta nunca é agradecimento, nem com "obrigado" na frente.
    'quando começa?', 'vcs mandam link?', 'obrigado, quando começa?',
    // Conteúdo de verdade.
    'enviei errado', 'não anda!', 'quero falar sobre o batismo', 'leonardo',
    // Número é escolha de setor.
    '2', '5', '2 grupos',
    // Frase inteira cai fora de propósito: abrir o menu para quem escreveu é o
    // erro mais barato dos dois.
    'olá!\nficamos no aguardo.\nmuito obrigada!',
  ];
  for (const t of casos) {
    it(`abre em ${JSON.stringify(t)}`, () => expect(ehSoAgradecimento(t)).toBe(false));
  }

  it('emoji que não é de gratidão não cala o bot', () => {
    expect(ehSoAgradecimento('😡')).toBe(false);
    expect(ehSoAgradecimento('❓')).toBe(false);
  });

  it('vazio não cala nada', () => {
    expect(ehSoAgradecimento('')).toBe(false);
    expect(ehSoAgradecimento('   ')).toBe(false);
    expect(ehSoAgradecimento(null as unknown as string)).toBe(false);
  });

  it('⚠️ saudação SOZINHA não é agradecimento — é o gatilho do menu', () => {
    // Se "bom dia" caísse como cortesia, quem cumprimenta antes de pedir ajuda
    // receberia uma resposta automática em vez do menu.
    expect(ehSoAgradecimento('bom dia')).toBe(false);
    expect(ehSoAgradecimento('boa noite')).toBe(false);
    // mas com agradecimento junto, cala
    expect(ehSoAgradecimento('bom dia, obrigado')).toBe(true);
  });

  it('texto longo tem conteúdo mesmo começando por obrigada', () => {
    expect(ehSoAgradecimento(
      'obrigada! aproveitando, vocês têm grupo na zona sul aos sábados?',
    )).toBe(false);
  });
});
