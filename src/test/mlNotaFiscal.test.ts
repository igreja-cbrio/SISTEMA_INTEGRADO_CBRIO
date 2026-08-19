import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { notaDeOrder, separarNovos, dataDoPedido, valorDoPedido } =
  require_('../../backend/utils/mlNotaFiscal.js');

// Formato real conferido em produção (19/08/2026): as 50 linhas de origem
// 'mercadolivre' têm `numero` = id do pedido, `emitente_nome` = apelido do
// vendedor, e CNPJ/chave_acesso/XML NULOS — o ML não expõe o documento fiscal
// da compra. A NF-e de verdade vem do Arquivei.
const pedido = {
  id: 2000015413198394,
  date_created: '2026-03-05T14:22:00.000-03:00',
  total_amount: 50,
  seller: { nickname: 'ARELLOSHOP' },
  order_items: [{ item: { title: '24 Clips Grampo Prendedor De Papel' } }],
};

describe('notaDeOrder · pedido do ML vira linha de nota', () => {
  it('mapeia os campos como as 50 linhas reais', () => {
    const n = notaDeOrder(pedido);
    expect(n.numero).toBe('2000015413198394');
    expect(n.ml_order_id).toBe('2000015413198394');
    expect(n.origem).toBe('mercadolivre');
    expect(n.status).toBe('registrada');
    expect(n.valor).toBe(50);
    expect(n.emitente_nome).toBe('ARELLOSHOP');
  });

  it('⚠️ NUNCA inventa chave de acesso, CNPJ ou XML — o ML não tem isso', () => {
    const n = notaDeOrder(pedido);
    expect(n.chave_acesso).toBeNull();
    expect(n.emitente_cnpj).toBeNull();
    expect(n.xml_content).toBeUndefined();
  });

  it('descreve pelos itens do pedido', () => {
    expect(notaDeOrder(pedido).descricao).toContain('Clips Grampo');
  });

  it('recusa pedido sem valor em vez de gravar R$ 0,00', () => {
    expect(notaDeOrder({ ...pedido, total_amount: null, paid_amount: null })).toBeNull();
  });

  it('recusa pedido sem data em vez de carimbar hoje', () => {
    expect(notaDeOrder({ ...pedido, date_created: null, date_closed: null })).toBeNull();
  });

  it('recusa pedido sem id', () => {
    expect(notaDeOrder({ ...pedido, id: null })).toBeNull();
  });

  it('valor zero é legítimo (brinde/estorno), null não', () => {
    expect(valorDoPedido({ total_amount: 0 })).toBe(0);
    expect(valorDoPedido({ total_amount: 'abc' })).toBeNull();
    expect(valorDoPedido({})).toBeNull();
  });

  it('data em ISO, sem deslocar pelo fuso local', () => {
    expect(dataDoPedido({ date_created: '2026-03-05T14:22:00.000-03:00' })).toBe('2026-03-05');
    expect(dataDoPedido({ date_created: 'nao-e-data' })).toBeNull();
  });
});

describe('separarNovos · idempotência é obrigação do código', () => {
  it('pula o que já está na base (a tabela não tem UNIQUE em ml_order_id)', () => {
    const { novas, repetidos } = separarNovos([pedido], new Set(['2000015413198394']));
    expect(novas).toHaveLength(0);
    expect(repetidos).toBe(1);
  });

  it('não duplica dentro do PRÓPRIO lote', () => {
    const { novas, repetidos } = separarNovos([pedido, { ...pedido }], new Set());
    expect(novas).toHaveLength(1);
    expect(repetidos).toBe(1);
  });

  it('conta os ignorados em vez de sumir com eles', () => {
    const { novas, ignorados } = separarNovos(
      [pedido, { ...pedido, id: 999, total_amount: null }], new Set());
    expect(novas).toHaveLength(1);
    expect(ignorados).toBe(1);
  });

  it('importa o que é novo', () => {
    const { novas } = separarNovos([pedido], new Set(['outro-id']));
    expect(novas).toHaveLength(1);
  });

  it('lista vazia/inválida não estoura', () => {
    expect(separarNovos([], new Set()).novas).toEqual([]);
    expect(separarNovos(null as never, new Set()).novas).toEqual([]);
  });
});
