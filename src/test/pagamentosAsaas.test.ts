import { describe, it, expect, vi, afterEach } from 'vitest';

import * as asaas from '../../backend/services/pagamentos/providers/asaas.js';
import { STATUS, METODOS, STATUS_VALIDOS } from '../../backend/services/pagamentos/tipos.js';

const A = asaas as any;
const I = A._internos;

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/**
 * Rede DESLIGADA nos testes de guarda de ambiente.
 *
 * ⚠️ Sem isto, `criarCobranca` passa da guarda e faz uma chamada REAL ao
 * sandbox do Asaas: o teste vira dependente de rede (flaky no gate de deploy,
 * que bloqueia produção com teste vermelho) e bate em API de terceiro a cada
 * deploy. O erro de rede é justamente o que o caso "preview aceita sandbox"
 * espera — então stubar torna o teste determinístico E fiel ao que ele afirma.
 */
function semRede() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
}

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
    semRede();
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/SANDBOX/);
  });

  it('PREVIEW da Vercel ACEITA key de sandbox, apesar de NODE_ENV=production', async () => {
    // A Vercel põe NODE_ENV=production em todo deploy, inclusive preview. Sem
    // olhar VERCEL_ENV primeiro, a guarda barraria o sandbox exatamente no
    // ambiente onde ele precisa rodar. O erro esperado aqui é de REDE (a
    // chamada sai), nunca de ambiente.
    semRede();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.not.toThrow(/SANDBOX|PRODUÇÃO/);
  });

  it('PRODUCTION da Vercel recusa key de sandbox', async () => {
    semRede();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/SANDBOX/);
  });

  it('PREVIEW da Vercel recusa key de PRODUÇÃO', async () => {
    // O inverso, que é o acidente pior: preview cobrando dinheiro real.
    semRede();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', '$aact_prod_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/PRODUÇÃO/);
  });

  it('key de PRODUÇÃO fora de produção lança', async () => {
    // O acidente pior: um teste cobrando dinheiro real de alguém.
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ASAAS_API_KEY', '$aact_prod_abc123');
    await expect(A.criarCobranca({ valor_centavos: 100 })).rejects.toThrow(/PRODUÇÃO/);
  });

  it('sem ASAAS_API_KEY lança em vez de tentar chamar a API', async () => {
    vi.stubEnv('VERCEL_ENV', '');
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

describe('asaas · QR do Pix é best-effort', () => {
  // A garantia que importa: uma cobrança JÁ EXISTE quando o QR é buscado, e a
  // vaga já está reservada. Se esta chamada extra estourasse, a pessoa perderia
  // a inscrição por causa de um enfeite de tela.
  const comChave = () => {
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_teste');
    vi.stubEnv('VERCEL_ENV', 'preview');
  };
  const respostaFetch = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({
      ok, status, text: () => Promise.resolve(JSON.stringify(body)),
    } as any);

  afterEach(() => { vi.unstubAllGlobals(); });

  it('devolve payload e imagem quando o Asaas tem Pix', async () => {
    comChave();
    vi.stubGlobal('fetch', respostaFetch({
      success: true, payload: '00020126BR.GOV.BCB.PIX', encodedImage: 'iVBORw0KGgo=',
      expirationDate: '2026-08-01 12:00:00',
    }));
    const qr = await I.buscarPixQrCode('pay_123');
    expect(qr).toEqual({ payload: '00020126BR.GOV.BCB.PIX', base64: 'iVBORw0KGgo=' });
  });

  it('success:false vira null — é o Asaas dizendo que esta cobrança não tem Pix', async () => {
    // Cenário real de `billingType: UNDEFINED`, onde o pagador ainda não
    // escolheu método. A tela cai no checkout hospedado, sem QR quebrado.
    comChave();
    vi.stubGlobal('fetch', respostaFetch({ success: false }));
    expect(await I.buscarPixQrCode('pay_123')).toBeNull();
  });

  it('erro HTTP NÃO propaga — devolve null em vez de derrubar a cobrança', async () => {
    comChave();
    vi.stubGlobal('fetch', respostaFetch({ errors: [{ description: 'Pix indisponível' }] }, false, 400));
    await expect(I.buscarPixQrCode('pay_123')).resolves.toBeNull();
  });

  it('falha de rede NÃO propaga', async () => {
    comChave();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(I.buscarPixQrCode('pay_123')).resolves.toBeNull();
  });

  it('sem id de cobrança não chega a chamar o Asaas', async () => {
    comChave();
    const f = respostaFetch({ success: true });
    vi.stubGlobal('fetch', f);
    expect(await I.buscarPixQrCode(null)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('asaas · definirMetodo confirma a forma que VOLTOU', () => {
  // Regressão do teste em sandbox (30/07): a tela mostrava a aba "Cartão"
  // selecionada e o campo FORMA dizendo "boleto" ao mesmo tempo. A forma
  // canônica tem que sair do `billingType` que o Asaas devolveu — nunca do que
  // pedimos (lei nº 2 do núcleo). Gravar o pedido faz o banco mentir.
  const comChave = () => {
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_teste');
    vi.stubEnv('VERCEL_ENV', 'preview');
  };
  // Cada resposta na ordem em que o adapter chama: GET payment → PUT payment → …
  const emSequencia = (respostas: unknown[]) => {
    const f = vi.fn();
    for (const body of respostas) {
      f.mockResolvedValueOnce({
        ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)),
      } as any);
    }
    return f;
  };
  const cobranca = { provider_cobranca_id: 'pay_123' };

  afterEach(() => { vi.unstubAllGlobals(); });

  it('aceita quando o Asaas confirma o billingType pedido', async () => {
    comChave();
    vi.stubGlobal('fetch', emSequencia([
      { id: 'pay_123', billingType: 'UNDEFINED', dueDate: '2026-08-01', value: 900 },
      { id: 'pay_123', billingType: 'CREDIT_CARD', invoiceUrl: 'https://asaas/i/x' },
    ]));
    const r = await A.definirMetodo(cobranca, METODOS.CARTAO);
    expect(r.metodo).toBe(METODOS.CARTAO);
    expect(r.checkout_url).toBe('https://asaas/i/x');
  });

  it('LANÇA quando o PUT volta 200 mantendo a forma antiga', async () => {
    // É o caso da conta sem cartão habilitado: o Asaas não recusa, só ignora.
    // Sem esta guarda gravávamos `cartao` numa cobrança que segue boleto.
    comChave();
    vi.stubGlobal('fetch', emSequencia([
      { id: 'pay_123', billingType: 'BOLETO', dueDate: '2026-08-01', value: 900 },
      { id: 'pay_123', billingType: 'BOLETO', invoiceUrl: 'https://asaas/i/x' },
    ]));
    await expect(A.definirMetodo(cobranca, METODOS.CARTAO))
      .rejects.toThrow(/não habilitou cartao/i);
  });

  it('já está na forma pedida: não faz PUT, só confirma', async () => {
    comChave();
    const f = emSequencia([
      { id: 'pay_123', billingType: 'BOLETO', dueDate: '2026-08-01', value: 900, identificationField: '34191...' },
    ]);
    vi.stubGlobal('fetch', f);
    const r = await A.definirMetodo(cobranca, METODOS.BOLETO);
    expect(r.metodo).toBe(METODOS.BOLETO);
    expect(r.boleto_linha_digitavel).toBe('34191...');
    // 1 chamada = só o GET. Um PUT à toa reescreveria dueDate/value sem motivo.
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('forma que o Asaas não cobra nem chega a falar com a API', async () => {
    comChave();
    const f = emSequencia([{}]);
    vi.stubGlobal('fetch', f);
    await expect(A.definirMetodo(cobranca, METODOS.DINHEIRO)).rejects.toThrow(/não cobra/i);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('asaas · parcelamento é ESCOLHA da pessoa, não o teto do evento', () => {
  // Regressão do bug de dinheiro de 30/07: `parcelas_max` (teto de configuração)
  // era enviado como `installmentCount`, então TODA cobrança de um evento com
  // teto 12 nascia como 12 × R$ 75 — o QR do Pix saía com R$ 75 enquanto a tela
  // mostrava R$ 900, e o pagamento da 1ª parcela quitava a cobrança, confirmando
  // a inscrição com 1/12 pago.
  const comChave = () => {
    vi.stubEnv('ASAAS_API_KEY', '$aact_hmlg_teste');
    vi.stubEnv('VERCEL_ENV', 'preview');
  };
  const respostas = (lista: unknown[]) => {
    const f = vi.fn();
    for (const body of lista) {
      f.mockResolvedValueOnce({
        ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)),
      } as any);
    }
    return f;
  };
  const corpoDaChamada = (f: any, i: number) => JSON.parse(f.mock.calls[i][1].body);

  afterEach(() => { vi.unstubAllGlobals(); });

  it('criarCobranca NUNCA manda installmentCount, mesmo com parcelas_max alto', async () => {
    comChave();
    const f = respostas([
      { data: [{ id: 'cus_1' }] },                                  // busca cliente
      { id: 'pay_1', invoiceUrl: 'https://asaas/i/x', value: 900 }, // POST /payments
      { success: false },                                           // QR best-effort
    ]);
    vi.stubGlobal('fetch', f);

    await A.criarCobranca({
      valor_centavos: 90000, parcelas_max: 12, referencia: 'inscricao:abc',
      pagador_nome: 'Maria', pagador_cpf: '39053344705', vencimento: '2026-08-01',
    });

    const corpo = corpoDaChamada(f, 1);
    expect(corpo.installmentCount).toBeUndefined();
    expect(corpo.totalValue).toBeUndefined();
    // Valor CHEIO na cobrança: é o que o QR do Pix e a tela têm que mostrar.
    expect(corpo.value).toBe(900);
  });

  it('definirMetodo parcela SÓ no cartão e com o número escolhido', async () => {
    comChave();
    const f = respostas([
      { id: 'pay_1', billingType: 'UNDEFINED', dueDate: '2026-08-01', value: 900 },
      { id: 'pay_1', billingType: 'CREDIT_CARD', installmentCount: 6, invoiceUrl: 'https://asaas/i/x' },
    ]);
    vi.stubGlobal('fetch', f);

    const r = await A.definirMetodo(
      { provider_cobranca_id: 'pay_1', valor_centavos: 90000 }, METODOS.CARTAO, { parcelas: 6 },
    );
    const put = corpoDaChamada(f, 1);
    expect(put.installmentCount).toBe(6);
    expect(put.totalValue).toBe(900);   // valor CHEIO; o Asaas divide
    expect(put.value).toBeUndefined();  // `value` seria o valor da parcela
    expect(r.parcelas).toBe(6);
  });

  it('Pix IGNORA parcelas — QR de uma parcela com a tela mostrando o total era o bug', async () => {
    comChave();
    const f = respostas([
      { id: 'pay_1', billingType: 'UNDEFINED', dueDate: '2026-08-01', value: 900 },
      { id: 'pay_1', billingType: 'PIX', value: 900 },
      { success: true, payload: '00020126', encodedImage: 'iVBOR' },
    ]);
    vi.stubGlobal('fetch', f);

    const r = await A.definirMetodo(
      { provider_cobranca_id: 'pay_1', valor_centavos: 90000 }, METODOS.PIX, { parcelas: 12 },
    );
    const put = corpoDaChamada(f, 1);
    expect(put.installmentCount).toBeNull();  // desfaz plano, não cria
    expect(put.value).toBe(900);
    expect(r.parcelas).toBe(1);
  });

  it('1ª parcela paga em PIX não quita a cobrança (só cartão quita)', () => {
    // Sem esta guarda, uma cobrança parcelada paga por Pix marcava `statusFinal`
    // PAGO na primeira parcela → inscrição confirmada com 1/N do valor.
    const pix = A.normalizarEvento({
      id: 'evt_1', event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_p1', value: 75, netValue: 73, billingType: 'PIX', status: 'CONFIRMED',
        installment: 'inst_1', installmentCount: 12, installmentNumber: 1,
      },
    });
    expect(pix.quita_cobranca).toBe(false);

    const cartao = A.normalizarEvento({
      id: 'evt_2', event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_c1', value: 75, netValue: 73, billingType: 'CREDIT_CARD', status: 'CONFIRMED',
        installment: 'inst_1', installmentCount: 12, installmentNumber: 1,
      },
    });
    expect(cartao.quita_cobranca).toBe(true);
  });
});
