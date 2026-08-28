import { describe, it, expect } from 'vitest';

import {
  decidirDestinoCotacao,
  dispensaFinanceiro,
  motivoDispensaTexto,
  COMPRA_DIRETA_LIMITE,
} from '../../backend/utils/alcadaCompra.js';

// Esta régua decide se uma compra sai do caixa da igreja SEM passar pelo
// coordenador financeiro. Afrouxá-la por engano não gera erro em lugar nenhum —
// só faz dinheiro sair sem o aval de quem deveria dar. É por isso que ela é
// pura, vive em utils/ e dói aqui no gate de deploy.

describe('decidirDestinoCotacao · o caminho feliz', () => {
  it('compra dentro do teto dispensa o financeiro', () => {
    const r = decidirDestinoCotacao({ categoria: 'compras', valorCotado: 850 });
    expect(r.destino).toBe('compra_direta');
    expect(r.motivo).toBe('dentro_do_limite');
    expect(r.limite).toBe(1000);
  });

  it('serviço/manutenção entra na mesma regra (decisão do Matheus em 12/08)', () => {
    expect(decidirDestinoCotacao({ categoria: 'servico', valorCotado: 300 }).destino)
      .toBe('compra_direta');
  });

  it('o teto é INCLUSIVO — exatamente R$ 1.000 ainda dispensa', () => {
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: 1000 }).destino)
      .toBe('compra_direta');
  });

  it('um centavo acima do teto já vai pro financeiro', () => {
    const r = decidirDestinoCotacao({ categoria: 'compras', valorCotado: 1000.01 });
    expect(r.destino).toBe('financeiro');
    expect(r.motivo).toBe('acima_do_limite');
  });

  it('compra de R$ 0 (doada/cortesia) dispensa — não há dinheiro saindo', () => {
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: 0 }).destino)
      .toBe('compra_direta');
  });
});

describe('decidirDestinoCotacao · fail-closed', () => {
  // ⚠️ MUTATION TEST: trocar qualquer um destes `financeiro` por
  // `compra_direta` faz dinheiro sair sem aprovação. Todos têm que continuar
  // vermelhos se alguém "simplificar" a função.

  it('categoria fora da regra NUNCA dispensa', () => {
    for (const categoria of ['reembolso', 'pagamento', 'ti', 'reserva_espaco', 'marketing']) {
      const r = decidirDestinoCotacao({ categoria, valorCotado: 10 });
      expect(r.destino).toBe('financeiro');
      expect(r.motivo).toBe('categoria_fora_da_regra');
    }
  });

  it('categoria ausente ou estranha não dispensa', () => {
    expect(decidirDestinoCotacao({ valorCotado: 10 }).destino).toBe('financeiro');
    expect(decidirDestinoCotacao({ categoria: null, valorCotado: 10 }).destino).toBe('financeiro');
    expect(decidirDestinoCotacao({ categoria: 'COMPRAS', valorCotado: 10 }).destino).toBe('financeiro');
  });

  // ⚠️ O caso mais perigoso do arquivo: `Number(null)`, `Number(undefined)` e
  // `Number('')` valem 0 (bem, undefined é NaN) — e 0 está DENTRO do teto. Sem a
  // barreira explícita de ausência, "não informei o valor" viraria "compra de
  // R$ 0,00 aprovada sozinha".
  it('valor ausente não vira compra de R$ 0', () => {
    for (const valorCotado of [null, undefined, ''] as unknown[]) {
      const r = decidirDestinoCotacao({ categoria: 'compras', valorCotado: valorCotado as number });
      expect(r.destino).toBe('financeiro');
      expect(r.motivo).toBe('sem_valor_cotado');
    }
  });

  it('valor ilegível ou negativo não dispensa', () => {
    for (const valorCotado of ['abc', NaN, Infinity, -1, -0.01] as unknown[]) {
      expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: valorCotado as number }).destino)
        .toBe('financeiro');
    }
  });

  it('valor em string numérica é aceito (o corpo do POST chega como texto)', () => {
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: '750' }).destino)
      .toBe('compra_direta');
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: '1500' }).destino)
      .toBe('financeiro');
  });
});

describe('decidirDestinoCotacao · a escolha humana vence', () => {
  it('forcarFinanceiro manda pro financeiro mesmo dentro do teto', () => {
    const r = decidirDestinoCotacao({ categoria: 'compras', valorCotado: 10, forcarFinanceiro: true });
    expect(r.destino).toBe('financeiro');
    expect(r.motivo).toBe('pedido_explicito');
  });

  // ⚠️ Só o booleano `true` força. Se aceitasse qualquer valor "truthy", uma
  // string vazia do corpo do POST viraria false e um `'false'` viraria true —
  // que é o inverso do que quem clicou quis.
  it('forcarFinanceiro só vale como booleano true', () => {
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: 10, forcarFinanceiro: false }).destino)
      .toBe('compra_direta');
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: 10, forcarFinanceiro: undefined }).destino)
      .toBe('compra_direta');
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: 10, forcarFinanceiro: 'sim' as never }).destino)
      .toBe('compra_direta');
  });
});

describe('decidirDestinoCotacao · teto customizado', () => {
  it('respeita um teto maior quando informado', () => {
    expect(decidirDestinoCotacao({ categoria: 'compras', valorCotado: 2500, limite: 3000 }).destino)
      .toBe('compra_direta');
  });

  it('teto inválido cai no padrão de R$ 1.000, nunca em "sem teto"', () => {
    for (const limite of [0, -5, NaN, null, undefined, 'abc'] as unknown[]) {
      const r = decidirDestinoCotacao({ categoria: 'compras', valorCotado: 5000, limite: limite as number });
      expect(r.destino).toBe('financeiro');
      expect(r.limite).toBe(COMPRA_DIRETA_LIMITE);
    }
  });
});

describe('helpers', () => {
  it('dispensaFinanceiro concorda com decidirDestinoCotacao', () => {
    expect(dispensaFinanceiro({ categoria: 'compras', valorCotado: 999 })).toBe(true);
    expect(dispensaFinanceiro({ categoria: 'compras', valorCotado: 1001 })).toBe(false);
  });

  it('o motivo gravado diz o teto que valeu na hora', () => {
    expect(motivoDispensaTexto(1000)).toContain('R$ 1.000');
    expect(motivoDispensaTexto(3000)).toContain('R$ 3.000');
    // teto inválido não gera texto mentindo "R$ 0"
    expect(motivoDispensaTexto(0)).toContain('R$ 1.000');
  });

  it('o teto padrão é R$ 1.000 (a cifra que o Matheus definiu)', () => {
    expect(COMPRA_DIRETA_LIMITE).toBe(1000);
  });
});
