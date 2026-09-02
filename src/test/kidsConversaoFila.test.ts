// Contrato da régua da fila de conferência das decisões de fé do Kids.
// ⚠️ Dado sensível de MENOR: um vínculo errado faz a equipe conversar com a
// família ERRADA sobre a decisão espiritual do filho dela. Estes casos existem
// para que afrouxar a régua fique VERMELHO.
import { describe, it, expect } from 'vitest';
import * as fila from '../../backend/utils/kidsConversaoFila.js';

const { transicaoValida, avaliarResolucao, resumoFila } = fila as any;

const pendente = { status: 'pendente', crianca_id: null, culto_id: null };
const aplicada = { status: 'aplicada', crianca_id: 'c1', culto_id: 'k1' };
const CRIANCA = '11111111-2222-3333-4444-555555555555';

describe('transicaoValida', () => {
  it('pendente vai para resolvida ou descartada', () => {
    expect(transicaoValida('pendente', 'resolvida')).toBe(true);
    expect(transicaoValida('pendente', 'descartada')).toBe(true);
  });

  it('descartada volta para a fila', () => {
    expect(transicaoValida('descartada', 'pendente')).toBe(true);
  });

  it('⚠️ aplicada é TERMINAL — desfazer vínculo de menor não é efeito colateral da fila', () => {
    expect(transicaoValida('aplicada', 'pendente')).toBe(false);
    expect(transicaoValida('aplicada', 'resolvida')).toBe(false);
    expect(transicaoValida('aplicada', 'descartada')).toBe(false);
  });

  it('⚠️ FAIL-CLOSED: status desconhecido não permite transição nenhuma', () => {
    expect(transicaoValida('inventado', 'resolvida')).toBe(false);
    expect(transicaoValida('pendente', 'inventado')).toBe(false);
    expect(transicaoValida(null, 'resolvida')).toBe(false);
    expect(transicaoValida(undefined, undefined)).toBe(false);
  });
});

describe('avaliarResolucao · vincular', () => {
  it('exige a criança ESCOLHIDA — o servidor não adivinha na hora de gravar', () => {
    const r = avaliarResolucao({ linha: pendente, acao: 'vincular' });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('crianca_obrigatoria');
  });

  it('id curto/vazio não conta como escolha', () => {
    expect(avaliarResolucao({ linha: pendente, acao: 'vincular', criancaId: '' }).ok).toBe(false);
    expect(avaliarResolucao({ linha: pendente, acao: 'vincular', criancaId: '   ' }).ok).toBe(false);
    expect(avaliarResolucao({ linha: pendente, acao: 'vincular', criancaId: 'abc' }).ok).toBe(false);
  });

  it('com criança escolhida, resolve', () => {
    const r = avaliarResolucao({ linha: pendente, acao: 'vincular', criancaId: CRIANCA });
    expect(r.ok).toBe(true);
    expect(r.statusNovo).toBe('resolvida');
    expect(r.vincula).toBe(true);
  });

  it('⚠️ não revincula linha já aplicada, e diz onde se desfaz', () => {
    const r = avaliarResolucao({ linha: aplicada, acao: 'vincular', criancaId: CRIANCA });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('transicao_invalida');
    expect(r.mensagem).toMatch(/ficha da criança/i);
  });
});

describe('avaliarResolucao · descartar', () => {
  it('⚠️ motivo é OBRIGATÓRIO — sem o porquê ninguém sabe depois se foi engano', () => {
    expect(avaliarResolucao({ linha: pendente, acao: 'descartar' }).codigo).toBe('nota_obrigatoria');
    expect(avaliarResolucao({ linha: pendente, acao: 'descartar', nota: '  ' }).codigo).toBe('nota_obrigatoria');
    expect(avaliarResolucao({ linha: pendente, acao: 'descartar', nota: 'ok' }).codigo).toBe('nota_obrigatoria');
  });

  it('com motivo, descarta', () => {
    const r = avaliarResolucao({ linha: pendente, acao: 'descartar', nota: 'erro de digitação na planilha' });
    expect(r.ok).toBe(true);
    expect(r.statusNovo).toBe('descartada');
    expect(r.vincula).toBe(false);
  });

  it('⚠️ não descarta linha já aplicada', () => {
    const r = avaliarResolucao({ linha: aplicada, acao: 'descartar', nota: 'mudei de ideia' });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('transicao_invalida');
  });
});

describe('avaliarResolucao · bordas', () => {
  it('ação desconhecida não passa', () => {
    expect(avaliarResolucao({ linha: pendente, acao: 'aprovar' }).codigo).toBe('acao_invalida');
    expect(avaliarResolucao({ linha: pendente, acao: undefined }).codigo).toBe('acao_invalida');
  });

  it('linha ausente não passa (e não lança)', () => {
    expect(avaliarResolucao({ acao: 'vincular', criancaId: CRIANCA }).codigo).toBe('linha_ausente');
    expect(avaliarResolucao({ linha: null, acao: 'descartar', nota: 'motivo bom' }).codigo).toBe('linha_ausente');
    expect(() => avaliarResolucao()).not.toThrow();
  });

  it('só o descartado reabre', () => {
    expect(avaliarResolucao({ linha: { status: 'descartada' }, acao: 'reabrir' }).ok).toBe(true);
    expect(avaliarResolucao({ linha: pendente, acao: 'reabrir' }).ok).toBe(false);
    expect(avaliarResolucao({ linha: aplicada, acao: 'reabrir' }).ok).toBe(false);
  });
});

describe('resumoFila', () => {
  it('conta por status e as linhas FECHAM', () => {
    const r = resumoFila([
      { status: 'aplicada', crianca_id: 'a', culto_id: 'k' },
      { status: 'aplicada', crianca_id: 'b', culto_id: null },
      { status: 'pendente', crianca_id: null, culto_id: null },
      { status: 'descartada', crianca_id: null, culto_id: 'k' },
    ]);
    expect(r.total).toBe(4);
    expect(r.aplicada).toBe(2);
    expect(r.a_conferir).toBe(1);
    expect(r.sem_culto).toBe(2);
    expect(r.sem_crianca).toBe(2);
    expect(r.fecha).toBe(true);
  });

  it('⚠️ status fora do vocabulário é CONTADO como desconhecido, não somem', () => {
    const r = resumoFila([{ status: 'zumbi' }, { status: 'pendente' }]);
    expect(r.total).toBe(2);
    expect(r.desconhecido).toBe(1);
    expect(r.fecha).toBe(true);
  });

  it('lista vazia ou inválida não lança', () => {
    expect(resumoFila([]).total).toBe(0);
    expect(resumoFila(null).total).toBe(0);
    expect(resumoFila([null, undefined]).total).toBe(0);
  });
});
