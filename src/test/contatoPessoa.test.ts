import { describe, it, expect } from 'vitest';
// @ts-ignore — serviço do backend em CommonJS, sem tipos.
import contato from '../../backend/services/contatoPessoa.js';

const { telefoneAlcancavel, classificarContato, contatoParaLider, MOTIVOS } = contato;

describe('telefoneAlcancavel · espelha o envio e fecha o buraco do DDD', () => {
  it('aceita celular e fixo brasileiros', () => {
    expect(telefoneAlcancavel('21996983574')).toBe(true);   // celular RJ
    expect(telefoneAlcancavel('2133334444')).toBe(true);    // fixo RJ
    expect(telefoneAlcancavel('(21) 99698-3574')).toBe(true); // com máscara
    expect(telefoneAlcancavel('5521996983574')).toBe(true); // já com DDI 55
  });

  it('⚠️ DDD 55 (Santa Maria/RS) é legítimo — não confundir com código do país', () => {
    expect(telefoneAlcancavel('55999887766')).toBe(true);
  });

  // Os casos REAIS do lançamento de 02/08.
  it('recusa o que o lançamento deixou passar', () => {
    expect(telefoneAlcancavel('0765764538')).toBe(false);   // DDD "07" não existe
    expect(telefoneAlcancavel('41765764538')).toBe(false);  // 11 dígitos sem o 9
    expect(telefoneAlcancavel('996013179')).toBe(false);    // 9 dígitos, sem DDD
    expect(telefoneAlcancavel('55219969835')).toBe(false);  // "+55" truncado
  });

  it('recusa vazio e lixo', () => {
    expect(telefoneAlcancavel('')).toBe(false);
    expect(telefoneAlcancavel(null)).toBe(false);
    expect(telefoneAlcancavel('abc')).toBe(false);
    expect(telefoneAlcancavel('11')).toBe(false);
  });
});

describe('classificarContato', () => {
  it('telefone bom e sem falha = ok, sem selo', () => {
    const c = classificarContato({ telefone: '21996983574', email: 'a@b.com' });
    expect(c.ok).toBe(true);
    expect(c.motivo).toBeNull();
    expect(c.rotulo).toBeNull();
    expect(c.usarEmail).toBe(false);
  });

  it('número que o envio não alcança → "Número errado — impossível contato"', () => {
    const c = classificarContato({ telefone: '0765764538', email: 'p@k.ch' });
    expect(c.ok).toBe(false);
    expect(c.motivo).toBe(MOTIVOS.NUMERO_ERRADO);
    expect(c.rotulo).toBe('Número errado — impossível contato');
    expect(c.usarEmail).toBe(true);
  });

  // Decisão do Marcos: brasileiro sem WhatsApp = mesma coisa que estrangeiro.
  it('brasileiro válido que a Meta disse "undeliverable" tem o MESMO rótulo', () => {
    const est = classificarContato({ telefone: '0765764538', email: 'x@y.com' });
    const br = classificarContato({ telefone: '21997075515', email: 'x@y.com', entregaFalhou: true });
    expect(br.ok).toBe(false);
    expect(br.motivo).toBe(MOTIVOS.SEM_WHATSAPP);
    expect(br.rotulo).toBe(est.rotulo);
  });

  it('falha de entrega em número já inválido não muda o rótulo (não duplica selo)', () => {
    const c = classificarContato({ telefone: '0765764538', entregaFalhou: true });
    expect(c.motivo).toBe(MOTIVOS.NUMERO_ERRADO);
  });

  it('sem telefone é caso PRÓPRIO (não é "número errado")', () => {
    const c = classificarContato({ telefone: '', email: 'a@b.com' });
    expect(c.motivo).toBe(MOTIVOS.SEM_TELEFONE);
    expect(c.rotulo).toBe('Sem telefone');
  });

  it('não sugere e-mail quando não há e-mail (orientação vazia)', () => {
    const c = classificarContato({ telefone: '0765764538', email: null });
    expect(c.ok).toBe(false);
    expect(c.usarEmail).toBe(false);
  });
});

describe('contatoParaLider · o que o líder lê no WhatsApp', () => {
  it('contato normal: telefone e e-mail, como antes', () => {
    expect(contatoParaLider({ telefone: '21996983574', email: 'a@b.com', telefoneExibicao: '(21) 99698-3574' }))
      .toBe('(21) 99698-3574 · a@b.com');
  });

  it('telefone ruim + e-mail: manda pelo e-mail e DIZ por quê', () => {
    const t = contatoParaLider({ telefone: '0765764538', email: 'p@k.ch' });
    expect(t).toContain('p@k.ch');
    expect(t).toContain('não recebe WhatsApp');
    // Não pode oferecer o número quebrado como se servisse.
    expect(t).not.toContain('0765764538');
  });

  it('telefone ruim e SEM e-mail: avisa pra confirmar, não finge que dá pra falar', () => {
    const t = contatoParaLider({ telefone: '0765764538', email: null });
    expect(t).toContain('não recebe WhatsApp');
    expect(t).toContain('confirmar');
  });

  it('sem contato nenhum', () => {
    expect(contatoParaLider({ telefone: '', email: '' })).toBe('sem contato');
  });
});
