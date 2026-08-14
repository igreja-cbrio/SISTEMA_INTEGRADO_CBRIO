import { describe, it, expect } from 'vitest';
import {
  iniciarArrasto, moverArrasto, decidirSoltura, velocidadeAutoScroll,
  LIMIAR_ARRASTO_PX, FAIXA_AUTOSCROLL_PX, VELOCIDADE_AUTOSCROLL_MAX,
} from '../lib/arrastoKanban';

const inicio = (x = 100, y = 100) =>
  iniciarArrasto({ pointerId: 1, cardId: 'card-1', estadoOrigem: 'backlog', x, y });

describe('clique × arrasto (o card é as duas coisas)', () => {
  // ⚠️ Sem o limiar, todo clique viraria arrasto e o painel de detalhe nunca
  // abriria — e foi a disputa entre clique e arrasto que fez o gesto do Pedro
  // parecer "não deixou arrastar".
  it('movimento menor que o limiar é CLIQUE', () => {
    const e = moverArrasto(inicio(), 100 + LIMIAR_ARRASTO_PX - 1, 100);
    expect(e?.ativo).toBe(false);
    expect(decidirSoltura(e, 'producao')).toEqual({ acao: 'clique', cardId: 'card-1' });
  });

  it('movimento a partir do limiar é ARRASTO', () => {
    const e = moverArrasto(inicio(), 100 + LIMIAR_ARRASTO_PX, 100);
    expect(e?.ativo).toBe(true);
    expect(decidirSoltura(e, 'producao')).toEqual({ acao: 'mover', cardId: 'card-1', para: 'producao' });
  });

  it('conta a distância em DIAGONAL, não só no eixo X', () => {
    const e = moverArrasto(inicio(), 105, 105); // ~7,07px
    expect(e?.ativo).toBe(true);
  });

  // ⚠️ Uma vez arrasto, sempre arrasto: o ponteiro pode voltar perto da origem
  // no meio do gesto, e "desativar" ali faria o clique disparar ao soltar.
  it('não volta a ser clique quando o ponteiro retorna à origem', () => {
    let e = moverArrasto(inicio(), 300, 300);
    e = moverArrasto(e, 100, 100);
    expect(e?.ativo).toBe(true);
    expect(decidirSoltura(e, 'concluido').acao).toBe('mover');
  });
});

describe('soltar', () => {
  const arrastando = () => moverArrasto(inicio(), 400, 120);

  it('soltar FORA de qualquer coluna não faz nada', () => {
    expect(decidirSoltura(arrastando(), null)).toEqual({ acao: 'nada' });
  });

  // Um PATCH pro mesmo estado dispararia notificação de "mudou" sem mudança.
  it('soltar na PRÓPRIA coluna não faz nada', () => {
    expect(decidirSoltura(arrastando(), 'backlog')).toEqual({ acao: 'nada' });
  });

  it('coluna que não aceita o card não faz nada', () => {
    const r = decidirSoltura(arrastando(), 'triagem', (c) => c !== 'triagem');
    expect(r).toEqual({ acao: 'nada' });
  });

  it('sem arrasto em andamento não faz nada', () => {
    expect(decidirSoltura(null, 'producao')).toEqual({ acao: 'nada' });
    expect(moverArrasto(null, 1, 2)).toBeNull();
  });
});

describe('auto-scroll horizontal (as 6 colunas não caberiam na tela)', () => {
  const cont = { left: 0, right: 1000 };

  it('no meio do container não rola', () => {
    expect(velocidadeAutoScroll(500, cont)).toBe(0);
  });

  it('perto da borda ESQUERDA rola para a esquerda', () => {
    expect(velocidadeAutoScroll(10, cont)).toBeLessThan(0);
  });

  it('perto da borda DIREITA rola para a direita', () => {
    expect(velocidadeAutoScroll(995, cont)).toBeGreaterThan(0);
  });

  // ⚠️ Velocidade fixa faz a coluna passar voando e a pessoa perde o alvo.
  it('é PROPORCIONAL: mais perto da borda, mais rápido', () => {
    const quaseNaBorda = Math.abs(velocidadeAutoScroll(2, cont));
    const noComecoDaFaixa = Math.abs(velocidadeAutoScroll(FAIXA_AUTOSCROLL_PX - 4, cont));
    expect(quaseNaBorda).toBeGreaterThan(noComecoDaFaixa);
    expect(quaseNaBorda).toBeLessThanOrEqual(VELOCIDADE_AUTOSCROLL_MAX);
  });

  it('arrastar FORA do container rola no máximo, no sentido certo', () => {
    expect(velocidadeAutoScroll(-50, cont)).toBe(-VELOCIDADE_AUTOSCROLL_MAX);
    expect(velocidadeAutoScroll(1200, cont)).toBe(VELOCIDADE_AUTOSCROLL_MAX);
  });

  it('retângulo inválido ou ponteiro sem número não rola', () => {
    expect(velocidadeAutoScroll(NaN, cont)).toBe(0);
    expect(velocidadeAutoScroll(500, { left: 100, right: 100 })).toBe(0);
    expect(velocidadeAutoScroll(500, { left: NaN, right: 10 })).toBe(0);
  });
});
