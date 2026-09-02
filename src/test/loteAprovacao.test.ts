// O teto do "aprovar em lote" na fila de propostas dos agentes.
//
// ⚠️⚠️ O que estes testes protegem, em ordem de dano:
//   1. ⚠️⚠️ um clique em "selecionar todos + aprovar" disparar 432 avisos de uma
//      vez. O botão ficou DESARMADO desde sempre (id inteiro validado como
//      uuid), então 432 propostas represaram desde 26/05 — e o sino já tem
//      ~18,9 mil não lidas;
//   2. o corte acontecer em SILÊNCIO: truncar sem declarar faz quem clicou
//      achar que aprovou tudo (a lei do `adiados` declarado, do censo);
//   3. o teto vazar para o REJEITAR, que não avisa ninguém e cuja limitação só
//      tornaria a limpeza da fila mais trabalhosa.
import { describe, it, expect } from 'vitest';
import { planejarLote, textoConfirmacao, TETO_APLICAR_EM_LOTE } from '@/lib/loteAprovacao';

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

describe('planejarLote · aprovar tem teto', () => {
  it('⚠️⚠️ 432 selecionadas viram 25 nesta rodada, e o resto é DECLARADO', () => {
    const p = planejarLote(ids(432), 'apply');
    expect(p.vao).toHaveLength(TETO_APLICAR_EM_LOTE);
    expect(p.adiados).toBe(432 - TETO_APLICAR_EM_LOTE);
    expect(p.truncado).toBe(true);
  });

  it('abaixo do teto não corta nada e não declara corte', () => {
    const p = planejarLote(ids(5), 'apply');
    expect(p.vao).toHaveLength(5);
    expect(p.adiados).toBe(0);
    expect(p.truncado).toBe(false);
  });

  it('exatamente no teto não é truncado (fronteira)', () => {
    const p = planejarLote(ids(TETO_APLICAR_EM_LOTE), 'apply');
    expect(p.truncado).toBe(false);
    expect(p.adiados).toBe(0);
  });

  it('⚠️ preserva a ORDEM da tela — corta do fim, nunca embaralha', () => {
    const p = planejarLote(ids(30), 'apply');
    expect(p.vao[0]).toBe('1');
    expect(p.vao[TETO_APLICAR_EM_LOTE - 1]).toBe(String(TETO_APLICAR_EM_LOTE));
  });

  it('nada selecionado não avisa ninguém', () => {
    const p = planejarLote([], 'apply');
    expect(p.vao).toHaveLength(0);
    expect(p.avisa).toBe(false);
  });

  it('entrada inválida não estoura', () => {
    // ⚠️ null/undefined são aceitos pelo TIPO de propósito: a tela deriva os
    // ids de um useMemo que pode não ter carregado ainda.
    expect(planejarLote(null, 'apply').vao).toHaveLength(0);
    expect(planejarLote(undefined, 'apply').adiados).toBe(0);
    // @ts-expect-error entrada hostil de propósito (não é lista)
    expect(planejarLote({ 0: 'x' }, 'apply').vao).toHaveLength(0);
  });
});

describe('planejarLote · ⚠️⚠️ REJEITAR não tem teto', () => {
  it('as 432 saem de uma vez — rejeitar não avisa ninguém', () => {
    const p = planejarLote(ids(432), 'reject');
    expect(p.vao).toHaveLength(432);
    expect(p.truncado).toBe(false);
    expect(p.avisa).toBe(false);
  });

  it('⚠️ o teto existe pelo EFEITO COLATERAL, não pelo volume', () => {
    const mesmos = ids(100);
    expect(planejarLote(mesmos, 'reject').vao).toHaveLength(100);
    expect(planejarLote(mesmos, 'apply').vao).toHaveLength(TETO_APLICAR_EM_LOTE);
  });
});

describe('textoConfirmacao · diz o EFEITO, não o número de cliques', () => {
  it('⚠️⚠️ aprovar declara que vão SAIR avisos', () => {
    const t = textoConfirmacao(planejarLote(ids(10), 'apply'), 'apply');
    expect(t).toMatch(/10 avisos internos/);
    expect(t).toMatch(/respons/i);
  });

  it('⚠️ quando trunca, diz quantas ficaram e qual é o teto', () => {
    const t = textoConfirmacao(planejarLote(ids(432), 'apply'), 'apply');
    expect(t).toContain(String(432 - TETO_APLICAR_EM_LOTE));
    expect(t).toContain(String(TETO_APLICAR_EM_LOTE));
  });

  it('sem truncar, NÃO fala de próximo lote (não inventa ressalva)', () => {
    const t = textoConfirmacao(planejarLote(ids(3), 'apply'), 'apply');
    expect(t).not.toMatch(/próximo lote/);
  });

  it('⚠️ rejeitar DIZ que ninguém é avisado — é a diferença que importa', () => {
    const t = textoConfirmacao(planejarLote(ids(40), 'reject'), 'reject');
    expect(t).toMatch(/ningu[ée]m [ée] avisado/i);
    expect(t).not.toMatch(/avisos internos/);
  });

  it('singular e plural não saem quebrados', () => {
    expect(textoConfirmacao(planejarLote(ids(1), 'apply'), 'apply')).toMatch(/1 proposta /);
    expect(textoConfirmacao(planejarLote(ids(1), 'reject'), 'reject')).toMatch(/1 proposta\?/);
  });
});

describe('⚠️ o teto é pequeno o suficiente pra ver o efeito no sino', () => {
  it('não pode voltar a ser um número grande sem alguém decidir', () => {
    // Se subir, é decisão de quem opera a fila — não efeito colateral de refactor.
    expect(TETO_APLICAR_EM_LOTE).toBeLessThanOrEqual(50);
    expect(TETO_APLICAR_EM_LOTE).toBeGreaterThan(0);
  });
});
