import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { aceitaVinculo, podeVincular, candidatas } =
  require_('../../backend/utils/vinculoMlSolicitacao.js');

// ⚠️ Esta régua é usada por DOIS lugares: a lista do seletor (GET
// /vinculaveis-ml) e a decisão do POST /:id/vincular-ml. Divergir faz a tela
// oferecer uma solicitação que o servidor recusa com 403.

const EU = 'user-eu';
const OUTRO = 'user-outro';

const base = {
  id: 'sol-1',
  categoria: 'compras',
  status: 'em_cotacao',
  deleted_at: null,
  solicitante_id: OUTRO,
  responsavel_id: null,
  area_responsavel: 'compras',
};

describe('aceitaVinculo · o estado da solicitação', () => {
  it('compra em aberto aceita', () => {
    expect(aceitaVinculo(base)).toBe(true);
  });

  it('só categoria compras', () => {
    expect(aceitaVinculo({ ...base, categoria: 'reembolso' })).toBe(false);
    expect(aceitaVinculo({ ...base, categoria: 'ti' })).toBe(false);
  });

  it('encerrada não aceita', () => {
    for (const s of ['concluido', 'rejeitado', 'cancelado', 'avaliado']) {
      expect(aceitaVinculo({ ...base, status: s })).toBe(false);
    }
  });

  it('em andamento aceita (vocabulário real do CHECK)', () => {
    for (const s of ['em_cotacao', 'aguardando_aprovacao_origem', 'aprovado',
      'aguardando_entrega', 'em_atendimento', 'pendente']) {
      expect(aceitaVinculo({ ...base, status: s })).toBe(true);
    }
  });

  it('apagada não aceita', () => {
    expect(aceitaVinculo({ ...base, deleted_at: '2026-08-19' })).toBe(false);
  });

  it('já ter pedido NÃO bloqueia — trocar o vínculo errado é caso real', () => {
    expect(aceitaVinculo({ ...base, ml_order_id: '2000015413198394' })).toBe(true);
  });

  it('nulo não estoura', () => {
    expect(aceitaVinculo(null)).toBe(false);
  });
});

describe('podeVincular · os quatro caminhos, sem afrouxar nenhum', () => {
  it('admin e diretor sempre podem', () => {
    expect(podeVincular(base, { userId: EU, role: 'admin', areasResponsavel: [] })).toBe(true);
    expect(podeVincular(base, { userId: EU, role: 'diretor', areasResponsavel: [] })).toBe(true);
  });

  it('quem pediu pode', () => {
    expect(podeVincular({ ...base, solicitante_id: EU },
      { userId: EU, role: 'assistente', areasResponsavel: [] })).toBe(true);
  });

  it('quem é responsável pela solicitação pode', () => {
    expect(podeVincular({ ...base, responsavel_id: EU },
      { userId: EU, role: 'assistente', areasResponsavel: [] })).toBe(true);
  });

  it('responsável pela ÁREA pode', () => {
    expect(podeVincular(base,
      { userId: EU, role: 'assistente', areasResponsavel: ['compras'] })).toBe(true);
  });

  it('⚠️ responsável de OUTRA área não pode', () => {
    expect(podeVincular(base,
      { userId: EU, role: 'assistente', areasResponsavel: ['ti', 'rh'] })).toBe(false);
  });

  it('⚠️ estranho não pode', () => {
    expect(podeVincular(base,
      { userId: EU, role: 'assistente', areasResponsavel: [] })).toBe(false);
  });

  it('⚠️ sem área na solicitação, o caminho de área não abre', () => {
    expect(podeVincular({ ...base, area_responsavel: null },
      { userId: EU, role: 'assistente', areasResponsavel: ['compras'] })).toBe(false);
  });

  it('sem usuário não passa', () => {
    expect(podeVincular(base, { userId: null, role: 'admin' })).toBe(false);
    expect(podeVincular(base, {})).toBe(false);
  });
});

describe('candidatas · a lista é a interseção das duas réguas', () => {
  it('só o que aceita vínculo E o ator pode', () => {
    const lista = [
      { ...base, id: 'a' },                                   // área bate
      { ...base, id: 'b', status: 'concluido' },              // encerrada
      { ...base, id: 'c', categoria: 'ti' },                  // outra categoria
      { ...base, id: 'd', area_responsavel: 'rh' },           // área alheia
      { ...base, id: 'e', solicitante_id: EU, area_responsavel: 'rh' }, // é minha
    ];
    const r = candidatas(lista, { userId: EU, role: 'assistente', areasResponsavel: ['compras'] });
    expect(r.map((s: { id: string }) => s.id)).toEqual(['a', 'e']);
  });

  it('admin vê todas as abertas de compras', () => {
    const lista = [
      { ...base, id: 'a' },
      { ...base, id: 'b', area_responsavel: 'rh' },
      { ...base, id: 'c', status: 'cancelado' },
    ];
    const r = candidatas(lista, { userId: EU, role: 'admin', areasResponsavel: [] });
    expect(r.map((s: { id: string }) => s.id)).toEqual(['a', 'b']);
  });

  it('lista vazia/inválida não estoura', () => {
    expect(candidatas([], { userId: EU, role: 'admin' })).toEqual([]);
    expect(candidatas(null as never, { userId: EU, role: 'admin' })).toEqual([]);
  });
});
