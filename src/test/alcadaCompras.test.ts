import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  LIMITE_ALCADA_PADRAO,
  elegivelAlcada,
} = require_('../../backend/utils/alcadaCompras.js');

// Linha mínima de uma compra parada no portão financeiro, com cotação feita.
function compra(over: Record<string, unknown> = {}) {
  return {
    id: 'sol-1',
    categoria: 'compras',
    status: 'aguardando_aprovacao_financeira',
    precisa_aprovacao_financeira: true,
    aprovado_financeiro_em: null,
    deleted_at: null,
    cotacao_em: '2026-08-12T12:00:00Z',
    valor_cotado: 500,
    valor_estimado: 500,
    ...over,
  };
}

describe('alçada de compras · régua pura', () => {
  it('o teto padrão é R$ 1.000', () => {
    expect(LIMITE_ALCADA_PADRAO).toBe(1000);
  });

  it('compra cotada abaixo do teto é elegível', () => {
    const r = elegivelAlcada(compra({ valor_cotado: 500 }));
    expect(r.ok).toBe(true);
    expect(r.valor).toBe(500);
    expect(r.limite).toBe(1000);
  });

  it('valor EXATAMENTE no teto entra (a autorização é "até R$ 1.000")', () => {
    expect(elegivelAlcada(compra({ valor_cotado: 1000 })).ok).toBe(true);
  });

  it('um centavo acima do teto vai pro financeiro', () => {
    const r = elegivelAlcada(compra({ valor_cotado: 1000.01 }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('acima_do_limite');
  });

  // ⚠️ MUTANTE: trocar `valor_cotado` por `valor_estimado` na régua deixa este
  // teste vermelho. É o caso real — estimativa baixa do solicitante com
  // cotação alta liberaria compra fora da alçada.
  it('decide pelo valor COTADO, não pela estimativa do solicitante', () => {
    const r = elegivelAlcada(compra({ valor_estimado: 200, valor_cotado: 4000 }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('acima_do_limite');
    expect(r.valor).toBe(4000);
  });

  // ⚠️ MUTANTE: aceitar sem cotação faria as 19 compras paradas em `em_cotacao`
  // (todas com `valor_cotado` NULL) serem aprovadas por "R$ 0".
  it('sem cotação registrada NÃO é elegível, mesmo com valor baixo', () => {
    expect(elegivelAlcada(compra({ cotacao_em: null, valor_cotado: null })).motivo).toBe('sem_cotacao');
    expect(elegivelAlcada(compra({ cotacao_em: null, valor_cotado: 50 })).motivo).toBe('sem_cotacao');
    expect(elegivelAlcada(compra({ cotacao_em: '2026-08-12', valor_cotado: null })).motivo).toBe('sem_cotacao');
  });

  it('cotação de R$ 0 é cotação válida (doação/brinde)', () => {
    expect(elegivelAlcada(compra({ valor_cotado: 0 })).ok).toBe(true);
  });

  it('valor negativo não passa por "menor que o teto"', () => {
    // negativo é dado corrompido, mas ainda é <= teto — o que barra é o
    // `temCotacaoRegistrada` exigir >= 0.
    expect(elegivelAlcada(compra({ valor_cotado: -10 })).motivo).toBe('sem_cotacao');
  });

  it('valor não numérico é tratado como sem cotação', () => {
    expect(elegivelAlcada(compra({ valor_cotado: 'mil' })).motivo).toBe('sem_cotacao');
  });

  // ⚠️ MUTANTE: incluir 'servico' amplia a autorização além do que foi pedido.
  it('só vale pra categoria compras', () => {
    expect(elegivelAlcada(compra({ categoria: 'servico' })).motivo).toBe('categoria_fora');
    expect(elegivelAlcada(compra({ categoria: 'reembolso' })).motivo).toBe('categoria_fora');
    expect(elegivelAlcada(compra({ categoria: 'pagamento' })).motivo).toBe('categoria_fora');
    expect(elegivelAlcada(compra({ categoria: 'infraestrutura' })).motivo).toBe('categoria_fora');
  });

  it('só vale no portão financeiro aberto', () => {
    expect(elegivelAlcada(compra({ status: 'em_cotacao' })).motivo).toBe('nao_aguardando_financeiro');
    expect(elegivelAlcada(compra({ status: 'em_atendimento' })).motivo).toBe('nao_aguardando_financeiro');
    expect(elegivelAlcada(compra({ precisa_aprovacao_financeira: false })).motivo).toBe('nao_aguardando_financeiro');
    expect(elegivelAlcada(compra({ aprovado_financeiro_em: '2026-08-12T10:00:00Z' })).motivo)
      .toBe('nao_aguardando_financeiro');
  });

  it('solicitação excluída nunca é elegível', () => {
    expect(elegivelAlcada(compra({ deleted_at: '2026-08-01T00:00:00Z' })).motivo).toBe('excluida');
  });

  it('entrada inválida não explode', () => {
    expect(elegivelAlcada(null).ok).toBe(false);
    expect(elegivelAlcada(undefined).motivo).toBe('sem_solicitacao');
  });

  it('limite configurável por área é respeitado', () => {
    expect(elegivelAlcada(compra({ valor_cotado: 2500 }), 3000).ok).toBe(true);
    expect(elegivelAlcada(compra({ valor_cotado: 2500 }), 2000).motivo).toBe('acima_do_limite');
  });

  it('limite inválido cai no padrão em vez de virar NaN (que liberaria tudo)', () => {
    const r = elegivelAlcada(compra({ valor_cotado: 5000 }), 'muito' as unknown as number);
    expect(r.limite).toBe(1000);
    expect(r.ok).toBe(false);
  });
});
