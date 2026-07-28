import { describe, it, expect, vi, afterEach } from 'vitest';

// @ts-expect-error módulo JS sem tipos
import * as asaas from '../../backend/services/pagamentos/providers/asaas.js';
// @ts-expect-error módulo JS sem tipos
import { STATUS, METODOS, STATUS_VALIDOS } from '../../backend/services/pagamentos/tipos.js';

const A = asaas as any;
const I = A._internos;

afterEach(() => { vi.unstubAllEnvs(); });

// Payload no formato que o Asaas entrega. `payment` é o objeto da cobrança.
function evento(tipo: string, payment: Record<string, unknown> = {}) {
  return {
    id: `evt_${tipo}_001`,
    event: tipo,
    payment: {
      id: 'pay_123', customer: 'cus_1', value: 800, netValue: 768.5,
      billingType: 'PIX', status: 'RECEIVED', dueDate: '2026-08-10',
      externalReference: 'inscricao:abc', ...payment,
    },
  };
}

describe('asaas · dinheiro na fronteira', () => {
  it('centavos ⇄ reais sem erro de float', () => {
    // A API do Asaas fala reais decimais; é o único ponto onde float toca
    // dinheiro, e é por isso que passa por Math.round.
    expect(I.paraReais(80000)).toBe(800);
    expect(I.paraReais(79999)).toBe(799.99);
    expect(I.paraReais(1)).toBe(0.01);
    expect(I.paraCentavos(800)).toBe(80000);
    expect(I.paraCentavos(799.99)).toBe(79999);
    // 0.1 + 0.2 em float é 0.30000000000000004; sem round isto viraria 3000.0000004
    expect(I.paraCentavos(30.03)).toBe(3003);
  });

  it('paraCentavos devolve null pra ausente, não 0', () => {
    // 0 significaria "pagou zero"; null significa "não informado".
    expect(I.paraCentavos(null)).toBeNull();
    expect(I.paraCentavos(undefined)).toBeNull();
    expect(I.paraCentavos('')).toBeNull();
  });

  it('taxa vem de value − netValue, os dois do payload', () => {
    // Não é tabela de preço nossa: é a única forma como o Asaas expressa a
    // tarifa. Calcular por percentual seria garantir nunca fechar com o extrato.
    expect(I.taxaCentavos({ value: 800, netValue: 768.5 })).toBe(3150);
    expect(I.taxaCentavos({ value: 800, netValue: null })).toBeNull();
    // Líquido maior que bruto (não deveria acontecer) não vira taxa negativa.
    expect(I.taxaCentavos({ value: 100, netValue: 120 })).toBe(0);
  });
});

describe('asaas · guarda de ambiente pela key', () => {
  // ⚠️ `await` obrigatório: `expect(promise).rejects.toThrow()` sem await
  // devolve uma promise que ninguém confere e o teste passa vazio.
  it('key de SANDBOX em produção lança', async () => {
    // O acidente que importa: o teste "passou" porque não cobrou nada.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/SANDBOX/);
  });

  it('key de PRODUÇÃO fora de produção lança', async () => {
    // O acidente pior: um teste cobrando dinheiro real de alguém.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ASAAS_API_KEY', '$aact_prod_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/PRODUÇÃO/);
  });

  it('sem ASAAS_API_KEY lança em vez de tentar chamar a API', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ASAAS_API_KEY', '');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/não configurada/i);
  });

  it('base URL default segue o ambiente', () => {
    expect(I.BASE_PROD).toBe('https://api.asaas.com/v3');
    expect(I.BASE_SANDBOX).toBe('https://api-sandbox.asaas.com/v3');
  });
});

describe('asaas · verificação do webhook (token, NÃO HMAC)', () => {
  it('token correto passa', () => {
    const r = A.verificarAssinatura('{}', { 'asaas-access-token': 'segredo-x' }, 'segredo-x');
    expect(r.ok).toBe(true);
  });

  it('token errado, ausente ou de tamanho diferente é recusado', () => {
    expect(A.verificarAssinatura('{}', { 'asaas-access-token': 'outro-token' }, 'segredo-x').ok).toBe(false);
    expect(A.verificarAssinatura('{}', {}, 'segredo-x').ok).toBe(false);
    expect(A.verificarAssinatura('{}', { 'asaas-access-token': 'curto' }, 'segredo-longo').ok).toBe(false);
  });

  it('sem segredo configurado é FAIL-CLOSED', () => {
    // Aceitar sem segredo deixaria qualquer um postar "pagamento aprovado".
    const r = A.verificarAssinatura('{}', { 'asaas-access-token': 'qualquer' }, null);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/não configurado/i);
  });
});

describe('asaas · mapa de eventos', () => {
  it('CONFIRMED confirma a PESSOA (paga na hora)', () => {
    // Se esperássemos o RECEIVED, quem paga com cartão ficaria ~32 dias sem
    // estar confirmado e apareceria no retiro fora da lista.
    const e = A.normalizarEvento(evento('PAYMENT_CONFIRMED', { creditDate: null }));
    expect(e.status).toBe(STATUS.PAGO);
    expect(e.valor_pago_centavos).toBe(80000);
    expect(e.repassado_em).toBeNull();
  });

  it('RECEIVED traz o repasse — é o DINHEIRO disponível', () => {
    const e = A.normalizarEvento(evento('PAYMENT_RECEIVED', { creditDate: '2026-09-11' }));
    expect(e.status).toBe(STATUS.PAGO);
    expect(e.repassado_em).toBe('2026-09-11');
    expect(e.liquido_centavos).toBe(76850);
    expect(e.taxa_centavos).toBe(3150);
  });

  it('OVERDUE NÃO expira nada', () => {
    // Vencido no Asaas ≠ expirado nosso: Pix e boleto seguem pagáveis, e quem
    // libera a vaga é o nosso cron pelo expira_em. Mapear pra expirada aqui
    // liberaria a vaga de quem ainda vai pagar.
    const e = A.normalizarEvento(evento('PAYMENT_OVERDUE'));
    expect(e.status).toBeNull();
    expect(e.valor_pago_centavos).toBe(0);
  });

  it('recusa de cartão e reprovação de risco viram falhou', () => {
    expect(A.normalizarEvento(evento('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED')).status).toBe(STATUS.FALHOU);
    expect(A.normalizarEvento(evento('PAYMENT_REPROVED_BY_RISK_ANALYSIS')).status).toBe(STATUS.FALHOU);
  });

  it('estorno, estorno parcial e chargeback têm status próprios', () => {
    expect(A.normalizarEvento(evento('PAYMENT_REFUNDED')).status).toBe(STATUS.ESTORNADO);
    expect(A.normalizarEvento(evento('PAYMENT_PARTIALLY_REFUNDED')).status).toBe(STATUS.ESTORNADO_PARCIAL);
    expect(A.normalizarEvento(evento('PAYMENT_CHARGEBACK_REQUESTED')).status).toBe(STATUS.CHARGEBACK);
  });

  it('DELETED cancela; RESTORED reabre', () => {
    expect(A.normalizarEvento(evento('PAYMENT_DELETED')).status).toBe(STATUS.CANCELADA);
    expect(A.normalizarEvento(evento('PAYMENT_RESTORED')).status).toBe(STATUS.AGUARDANDO);
  });

  it('estorno EM ANDAMENTO não muda estado — espera concluir', () => {
    expect(A.normalizarEvento(evento('PAYMENT_REFUND_IN_PROGRESS')).status).toBeNull();
    expect(A.normalizarEvento(evento('PAYMENT_REFUND_DENIED')).status).toBeNull();
  });

  it('todo status do mapa é canônico do CBRio', () => {
    // Guarda contra alguém colar uma string do PSP aqui por engano.
    for (const [tipo, st] of Object.entries(I.STATUS_POR_EVENTO) as [string, string | null][]) {
      if (st === null) continue;
      expect(STATUS_VALIDOS, `${tipo} mapeia pra status não-canônico "${st}"`).toContain(st);
    }
  });

  it('só evento com dinheiro reporta valor', () => {
    for (const tipo of Object.keys(I.STATUS_POR_EVENTO)) {
      const e = A.normalizarEvento(evento(tipo));
      const esperaDinheiro = I.EVENTOS_COM_DINHEIRO.has(tipo);
      if (esperaDinheiro) expect(e.valor_pago_centavos, tipo).toBeGreaterThan(0);
      else expect(e.valor_pago_centavos, tipo).toBe(0);
    }
  });
});

describe('asaas · idempotência e parcelado', () => {
  it('evento_id é o id do EVENTO, não do pagamento', () => {
    // É a chave da UNIQUE (provider, evento_id). Usar o id do pagamento faria
    // CONFIRMED e RECEIVED do mesmo pagamento colidirem — o segundo seria
    // descartado como duplicado e o repasse nunca seria registrado.
    const e = A.normalizarEvento(evento('PAYMENT_RECEIVED'));
    expect(e.evento_id).toBe('evt_PAYMENT_RECEIVED_001');
    expect(e.provider_pagamento_id).toBe('pay_123');
    expect(e.evento_id).not.toBe(e.provider_pagamento_id);
  });

  it('sem id de evento, compõe uma chave estável (não aleatória)', () => {
    const p = evento('PAYMENT_RECEIVED') as any;
    delete p.id;
    const a = A.normalizarEvento(p);
    const b = A.normalizarEvento(p);
    expect(a.evento_id).toBe(b.evento_id);   // reentrega ainda é reconhecida
    expect(a.evento_id).toContain('pay_123');
  });

  it('parcelado marca quita_cobranca na confirmação', () => {
    // O Asaas cria N cobranças (uma por parcela), mas o pagador autorizou tudo
    // de uma vez. Sem isto a cobrança ficaria pago_parcial por 12 meses e a
    // inscrição nunca seria confirmada.
    const e = A.normalizarEvento(evento('PAYMENT_CONFIRMED', {
      installment: 'ins_9', installmentCount: 12, installmentNumber: 1,
      billingType: 'CREDIT_CARD', value: 66.67,
      creditCard: { creditCardBrand: 'VISA', creditCardNumber: '512345******1234' },
    }));
    expect(e.quita_cobranca).toBe(true);
    expect(e.parcelas).toBe(12);
    expect(e.parcela_numero).toBe(1);
    expect(e.metodo).toBe(METODOS.CARTAO);
  });

  it('pagamento à vista NÃO marca quita_cobranca', () => {
    // Aqui a soma é a verdade; forçar quitação esconderia pagamento parcial.
    const e = A.normalizarEvento(evento('PAYMENT_CONFIRMED', { installment: null }));
    expect(e.quita_cobranca).toBe(false);
  });

  it('estorno de parcelado não quita', () => {
    const e = A.normalizarEvento(evento('PAYMENT_REFUNDED', { installment: 'ins_9' }));
    expect(e.quita_cobranca).toBe(false);
  });
});

describe('asaas · cartão: só brand e last4', () => {
  it('extrai os 4 últimos do número mascarado', () => {
    expect(I.last4({ creditCardNumber: '512345******1234' })).toBe('1234');
    expect(I.last4({ creditCardNumber: '1234' })).toBe('1234');
  });

  it('sem cartão ou sem número devolve null, nunca string vazia', () => {
    expect(I.last4(null)).toBeNull();
    expect(I.last4({})).toBeNull();
    expect(I.last4({ creditCardNumber: '12' })).toBeNull();
  });

  it('o evento normalizado NÃO carrega dado sensível de cartão', () => {
    // Lei 5 do núcleo: nunca PAN/CVV/validade/nome impresso.
    const e = A.normalizarEvento(evento('PAYMENT_CONFIRMED', {
      billingType: 'CREDIT_CARD',
      creditCard: {
        creditCardBrand: 'MASTERCARD', creditCardNumber: '512345******1234',
        creditCardToken: 'tok_x', holderName: 'MARCOS P', expiryMonth: '12', cvv: '123',
      },
    }));
    expect(e.cartao_brand).toBe('MASTERCARD');
    expect(e.cartao_last4).toBe('1234');
    const chaves = Object.keys(e).join(',');
    for (const proibido of ['cvv', 'holder', 'expiry', 'creditCardNumber', 'token']) {
      expect(chaves.toLowerCase(), `campo sensível "${proibido}" vazou`).not.toContain(proibido.toLowerCase());
    }
  });
});

describe('asaas · payload inválido', () => {
  it('sem event ou sem payment devolve null (não lança)', () => {
    // Lançar aqui viraria retry eterno no PSP.
    expect(A.normalizarEvento(null)).toBeNull();
    expect(A.normalizarEvento({})).toBeNull();
    expect(A.normalizarEvento({ event: 'PAYMENT_RECEIVED' })).toBeNull();
    expect(A.normalizarEvento({ payment: { id: 'pay_1' } })).toBeNull();
  });

  it('evento desconhecido não vira status inventado', () => {
    const e = A.normalizarEvento(evento('PAYMENT_ALGO_QUE_NAO_EXISTE'));
    expect(e.status).toBeNull();
    expect(e.evento_id).toBeTruthy();   // mas é guardado pra replay
  });
});

describe('asaas · capacidades', () => {
  it('declara 21x e os métodos da fase 1', () => {
    expect(A.capacidades.parcelas_max).toBe(21);
    expect(A.capacidades.metodos).toContain(METODOS.PIX);
    expect(A.capacidades.metodos).toContain(METODOS.CARTAO);
    // Apple Pay fica pra fase 2 (merchant/domínio novo e não faz parcelado).
    expect(A.capacidades.metodos).not.toContain(METODOS.APPLE_PAY);
    expect(A.capacidades.webhook).toBe(true);
    expect(A.capacidades.consulta_status).toBe(true);
  });

  it('billingType do Asaas mapeia pro nosso vocabulário', () => {
    expect(I.metodoDeBillingType('PIX')).toBe(METODOS.PIX);
    expect(I.metodoDeBillingType('CREDIT_CARD')).toBe(METODOS.CARTAO);
    expect(I.metodoDeBillingType('BOLETO')).toBe(METODOS.BOLETO);
    // UNDEFINED = a pessoa ainda não escolheu; não é método.
    expect(I.metodoDeBillingType('UNDEFINED')).toBeNull();
    expect(I.metodoDeBillingType('COISA_NOVA')).toBeNull();
  });
});
