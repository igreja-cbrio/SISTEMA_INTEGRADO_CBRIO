import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  escolherVinculoSolicitante,
  semSolicitantePorDesenho,
} = require_('../../backend/utils/marketingSolicitante.js');

// ---------------------------------------------------------------------------
// Esta régua decide QUEM pode baixar o arquivo de um pedido. Os casos abaixo são
// os DOIS desenhos que existem em produção (medido 14/08: 1 card com vínculo
// direto, 8 pela campanha) — e as contraprovas de vazamento.
// ---------------------------------------------------------------------------
const CAMP = {
  id: 'camp-1',
  solicitacao_id: 'sol-1',
  solicitante_id: 'pessoa-1',
  deleted_at: null,
};

describe('vínculo card → solicitação', () => {
  it('vínculo DIRETO no card (fluxo legado) tem precedência', () => {
    const r = escolherVinculoSolicitante({
      card: { solicitacao_id: 'sol-direta', campanha_id: 'camp-1' },
      campanha: CAMP,
    });
    expect(r).toEqual({ solicitacao_id: 'sol-direta', solicitante_id: null, via: 'card' });
  });

  // ⚠️ ESTE é o caso que estava quebrado: 8 dos 9 cards de produção.
  it('resolve pela CAMPANHA quando o card não tem solicitacao_id', () => {
    const r = escolherVinculoSolicitante({
      card: { solicitacao_id: null, campanha_id: 'camp-1' },
      campanha: CAMP,
    });
    expect(r).toEqual({ solicitacao_id: 'sol-1', solicitante_id: 'pessoa-1', via: 'campanha' });
  });

  // ⚠️⚠️ A contraprova mais importante: campanha de OUTRO card não vale. Sem esta
  // guarda, um índice errado entregaria o arquivo de uma pessoa para outra.
  it('NUNCA aceita campanha de outro card', () => {
    const r = escolherVinculoSolicitante({
      card: { solicitacao_id: null, campanha_id: 'camp-1' },
      campanha: { ...CAMP, id: 'camp-OUTRA' },
    });
    expect(r).toBeNull();
  });

  it('campanha soft-deletada não vale', () => {
    const r = escolherVinculoSolicitante({
      card: { solicitacao_id: null, campanha_id: 'camp-1' },
      campanha: { ...CAMP, deleted_at: '2026-08-01T00:00:00Z' },
    });
    expect(r).toBeNull();
  });

  it('campanha sem solicitação (campanha de evento) não gera solicitante', () => {
    const r = escolherVinculoSolicitante({
      card: { solicitacao_id: null, campanha_id: 'camp-1' },
      campanha: { id: 'camp-1', solicitacao_id: null, event_id: 'ev-1', deleted_at: null },
    });
    expect(r).toBeNull();
  });

  // Card do ciclo criativo: não existe solicitante, e isso é o desenho.
  it('card de evento não tem solicitante', () => {
    expect(escolherVinculoSolicitante({
      card: { origem: 'evento', cycle_phase_task_id: 't-1', solicitacao_id: null, campanha_id: null },
    })).toBeNull();
  });

  it('não estoura com entrada ausente ou inválida', () => {
    for (const ruim of [undefined, null, {}, { card: null }, { card: 'x' }] as any[]) {
      expect(() => escolherVinculoSolicitante(ruim)).not.toThrow();
    }
    expect(escolherVinculoSolicitante({ card: { campanha_id: 'c' } })).toBeNull();
    expect(escolherVinculoSolicitante({ card: { campanha_id: 'c' }, campanha: null })).toBeNull();
  });

  // ⚠️ `solicitante_id` da campanha é ATALHO, não autoridade. Quem manda é a
  // tabela `solicitacoes` — por isso o `via` volta, pro serviço saber quando
  // precisa reconferir na fonte.
  it('declara POR ONDE resolveu', () => {
    expect(escolherVinculoSolicitante({ card: { solicitacao_id: 's' } })?.via).toBe('card');
    expect(escolherVinculoSolicitante({ card: { campanha_id: 'camp-1' }, campanha: CAMP })?.via).toBe('campanha');
  });
});

describe('sem solicitante POR DESENHO (≠ falha de leitura)', () => {
  it('card de evento e card interno solto', () => {
    expect(semSolicitantePorDesenho({ origem: 'evento' })).toBe(true);
    expect(semSolicitantePorDesenho({ origem: 'interna', solicitacao_id: null, campanha_id: null })).toBe(true);
  });

  it('card com campanha ou solicitação NÃO é "sem solicitante"', () => {
    expect(semSolicitantePorDesenho({ origem: 'interna', campanha_id: 'c' })).toBe(false);
    expect(semSolicitantePorDesenho({ origem: 'solicitacao', solicitacao_id: 's' })).toBe(false);
  });
});
