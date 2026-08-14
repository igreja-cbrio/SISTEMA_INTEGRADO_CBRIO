// Contrato da resposta "vou / não vou poder" que chega pelo WhatsApp.
//
// Pedido do Matheus (14/08/2026): "quero algo que a pessoa responda pelo wpp
// mesmo" — o aviso de véspera passou a sair com dois botões de quick-reply.
//
// ⚠️⚠️ MUTATION-TEST da causa raiz: "não vou poder" CONTÉM "vou". Avaliar a
// afirmação antes da negação transforma toda recusa em confirmação — a pessoa
// avisa que não vai, o sistema responde "presença confirmada", e no domingo
// ninguém repôs a vaga.
import { describe, it, expect } from 'vitest';
import {
  interpretarRespostaEscala, textoDaResposta, wamidRespondido,
} from '../../backend/utils/respostaEscala.js';

describe('⚠️ negação vence a afirmação embutida', () => {
  it('"Não vou poder" é RECUSA (contém "vou")', () => {
    expect(interpretarRespostaEscala('Não vou poder')).toBe('declined');
    expect(interpretarRespostaEscala('nao vou poder')).toBe('declined');
    expect(interpretarRespostaEscala('n vou conseguir')).toBe('declined');
  });

  it('outras formas de recusar', () => {
    for (const t of [
      'Não',
      'não posso',
      'infelizmente não vou conseguir',
      'nao consigo dessa vez',
      'Não vou',
      'preciso cancelar',
    ]) {
      expect(interpretarRespostaEscala(t), t).toBe('declined');
    }
  });
});

describe('confirmação', () => {
  it('formas de confirmar', () => {
    for (const t of [
      'Vou sim',
      'confirmo',
      'Confirmar presença',
      'sim',
      'ok',
      'beleza',
      'estarei lá',
      'pode contar comigo',
      'to dentro',
    ]) {
      expect(interpretarRespostaEscala(t), t).toBe('confirmed');
    }
  });

  it('acento e caixa não importam', () => {
    expect(interpretarRespostaEscala('ESTAREI LÁ')).toBe('confirmed');
    expect(interpretarRespostaEscala('Não Vou Poder')).toBe('declined');
  });
});

describe('⚠️ o que NÃO dá pra entender fica null', () => {
  it('não chuta', () => {
    // Chutar aqui é pior que não entender: o webhook responde pedindo pra usar
    // os botões, em vez de marcar presença que a pessoa não deu.
    for (const t of ['', '   ', 'oi', 'bom dia', '👍', 'quem é?', 'talvez']) {
      expect(interpretarRespostaEscala(t), JSON.stringify(t)).toBeNull();
    }
  });

  it('tolera nulo', () => {
    expect(interpretarRespostaEscala(null as any)).toBeNull();
    expect(interpretarRespostaEscala(undefined as any)).toBeNull();
  });
});

describe('textoDaResposta · os três formatos que a Meta manda', () => {
  it('quick-reply de TEMPLATE vem em button.text', () => {
    expect(textoDaResposta({ type: 'button', button: { text: 'Não vou poder', payload: 'nao' } } as any))
      .toBe('Não vou poder');
  });

  it('botão interativo de sessão vem em interactive.button_reply', () => {
    expect(textoDaResposta({ type: 'interactive', interactive: { button_reply: { id: 'x', title: 'Vou sim' } } } as any))
      .toBe('Vou sim');
  });

  it('texto digitado vem em text.body', () => {
    expect(textoDaResposta({ type: 'text', text: { body: 'não vou poder' } } as any)).toBe('não vou poder');
  });

  it('formato desconhecido devolve vazio, não quebra', () => {
    expect(textoDaResposta({ type: 'sticker' } as any)).toBe('');
    expect(textoDaResposta(null as any)).toBe('');
  });
});

describe('⚠️ wamidRespondido · é o que amarra a resposta à escala certa', () => {
  it('lê o context.id', () => {
    expect(wamidRespondido({ context: { id: 'wamid.ABC' } } as any)).toBe('wamid.ABC');
  });

  it('sem context não há a que responder', () => {
    // Sem isso não dá pra saber de qual convite a pessoa fala — quem serve em
    // duas áreas na mesma semana teria a recusa aplicada na escala errada.
    expect(wamidRespondido({} as any)).toBeNull();
    expect(wamidRespondido(null as any)).toBeNull();
  });
});

describe('⚠️ modelo OPT-OUT · um botão só, ou um número (14/08)', () => {
  it('"2" é a recusa e "1" a confirmação', () => {
    // Decisão do Matheus: "quero que tenha apenas um botão ou então um número
    // para ela digitar para dizer NÃO vai conseguir comparecer".
    expect(interpretarRespostaEscala('2')).toBe('declined');
    expect(interpretarRespostaEscala('2.')).toBe('declined');
    expect(interpretarRespostaEscala(' 2 ')).toBe('declined');
    expect(interpretarRespostaEscala('1')).toBe('confirmed');
  });

  it('⚠️ dígito no MEIO de uma frase não é resposta', () => {
    // "chego 2 minutos antes" não pode virar recusa — por isso o dígito casa a
    // mensagem inteira, não um número solto em qualquer lugar do texto.
    expect(interpretarRespostaEscala('chego 2 minutos antes')).toBeNull();
    expect(interpretarRespostaEscala('somos 2')).toBeNull();
  });

  it('outros números não significam nada', () => {
    for (const t of ['3', '0', '22', '10']) {
      expect(interpretarRespostaEscala(t), t).toBeNull();
    }
  });

  it('o texto do botão único continua sendo entendido', () => {
    expect(interpretarRespostaEscala('Não vou poder')).toBe('declined');
    expect(interpretarRespostaEscala('Não vou conseguir')).toBe('declined');
  });
});
