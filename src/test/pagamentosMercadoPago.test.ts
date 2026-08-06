// Contrato do adapter do Mercado Pago.
//
// ⚠️ Este arquivo está no GATE DE DEPLOY: teste vermelho aqui bloqueia produção.
// Por isso NENHUM teste faz rede — o `fetch` é stubado. A lição é o flake dos 4
// testes do Asaas que batiam no sandbox de verdade e derrubavam o deploy por
// tempo de resposta de terceiro.
//
// O que estes testes protegem, em ordem de dano:
//   1. a guarda de `live_mode` (é a ÚNICA que separa "o teste não cobrou" de
//      "o teste cobrou de verdade" — o token do MP não tem prefixo);
//   2. o manifesto da assinatura (byte a byte, incluindo o `;` final e o
//      minusculizar do ULID);
//   3. a tradução de status (mapear `authorized` como pago confirmaria
//      inscrição de quem só teve o cartão autorizado);
//   4. a ausência de PAN em qualquer coisa que o adapter devolva.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mp = require('../../backend/services/pagamentos/providers/mercadopago.js');
const {
  ambienteDeclarado, conferirLiveMode, statusCanonico, metodoDeMp,
  dadosDaOrder, dadosDoPayment, expiracaoPix, paraCentavos, paraReais,
  STATUS_POR_ORDER, STATUS_POR_PAYMENT,
} = mp._internos;

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-fake-para-teste';
  process.env.MERCADOPAGO_AMBIENTE = 'teste';
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
  vi.restoreAllMocks();
});

describe('mercadopago · ambiente (não há prefixo no token)', () => {
  it('respeita a env explícita nas duas grafias', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'producao';
    expect(ambienteDeclarado()).toBe('producao');
    process.env.MERCADOPAGO_AMBIENTE = 'sandbox';
    expect(ambienteDeclarado()).toBe('teste');
  });

  it('sem env, preview da Vercel é TESTE mesmo com NODE_ENV=production', () => {
    // ⚠️ Regressão real do adapter do Asaas: a Vercel define NODE_ENV=production
    // em todo deploy, inclusive preview. Só pelo NODE_ENV, o preview se
    // declararia produção — o ambiente onde justamente queremos o sandbox.
    delete process.env.MERCADOPAGO_AMBIENTE;
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    expect(ambienteDeclarado()).toBe('teste');
  });

  it('sem env, production da Vercel é PRODUÇÃO', () => {
    delete process.env.MERCADOPAGO_AMBIENTE;
    process.env.VERCEL_ENV = 'production';
    expect(ambienteDeclarado()).toBe('producao');
  });
});

describe('mercadopago · guarda de live_mode', () => {
  it('LANÇA quando declaramos teste e o MP responde live_mode=true', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'teste';
    expect(() => conferirLiveMode({ live_mode: true })).toThrow(/dinheiro real/i);
  });

  it('LANÇA quando declaramos produção e o MP responde live_mode=false', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'producao';
    expect(() => conferirLiveMode({ live_mode: false })).toThrow(/TESTE em produção/i);
  });

  it('passa quando batem', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'producao';
    expect(() => conferirLiveMode({ live_mode: true })).not.toThrow();
  });

  it('não inventa erro quando o payload não traz live_mode', () => {
    // Nem toda resposta do MP tem o campo. Recusar por ausência de sinal
    // quebraria o fluxo por nada.
    expect(() => conferirLiveMode({ id: 'x' })).not.toThrow();
    expect(() => conferirLiveMode(null)).not.toThrow();
  });
});

describe('mercadopago · assinatura do webhook', () => {
  const SEGREDO = 'segredo-do-painel';

  function assinar(id: string, requestId: string, ts: string) {
    const manifesto = `id:${id};request-id:${requestId};ts:${ts};`;
    return crypto.createHmac('sha256', SEGREDO).update(manifesto).digest('hex');
  }

  it('aceita assinatura válida montada com data.id do QUERY STRING', () => {
    const ts = '1704908010';
    const reqId = 'abc-123';
    const v1 = assinar('12345', reqId, ts);
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
      SEGREDO,
      { query: { 'data.id': '12345' } },
    );
    expect(r.ok).toBe(true);
  });

  it('minusculiza o ULID da Orders API antes de montar o manifesto', () => {
    // ⚠️ A doc manda converter alfanumérico maiúsculo pra minúsculo, e os ids
    // da Orders API são ULIDs MAIÚSCULOS — ou seja, é o caso NORMAL. Sem isto,
    // todo webhook de Pix tomaria 401.
    const ts = '1704908010';
    const reqId = 'req-9';
    const v1 = assinar('ord01j5abc', reqId, ts);   // assinado em minúsculo
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
      SEGREDO,
      { query: { 'data.id': 'ORD01J5ABC' } },      // recebido em maiúsculo
    );
    expect(r.ok).toBe(true);
  });

  it('recusa quando a assinatura não confere', () => {
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': 'ts=1,v1=' + 'a'.repeat(64), 'x-request-id': 'r' },
      SEGREDO,
      { query: { 'data.id': '1' } },
    );
    expect(r.ok).toBe(false);
  });

  it('é FAIL-CLOSED sem segredo configurado', () => {
    // Aceitar entrega não verificada é aceitar que qualquer um confirme
    // pagamento. Mutation-test: trocar por `return {ok:true}` deixa vermelho.
    const r = mp.verificarAssinatura('{}', { 'x-signature': 'ts=1,v1=x' }, '');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/SECRET/i);
  });

  it('recusa header ausente ou malformado', () => {
    expect(mp.verificarAssinatura('{}', {}, SEGREDO).ok).toBe(false);
    expect(mp.verificarAssinatura('{}', { 'x-signature': 'lixo' }, SEGREDO).ok).toBe(false);
  });

  it('cai no data.id do CORPO quando a query não traz (entrega sem query string)', () => {
    const ts = '99';
    const v1 = assinar('777', '', ts);
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': `ts=${ts},v1=${v1}` },
      SEGREDO,
      { payload: { data: { id: '777' } } },
    );
    expect(r.ok).toBe(true);
  });
});

describe('mercadopago · tradução de status', () => {
  it('Orders: processed/accredited é PAGO', () => {
    expect(statusCanonico('processed', 'accredited', STATUS_POR_ORDER)).toBe('pago');
  });

  it('Orders: action_required/waiting_transfer (Pix emitido) NÃO é pago', () => {
    expect(statusCanonico('action_required', 'waiting_transfer', STATUS_POR_ORDER))
      .toBe('aguardando_pagamento');
  });

  it('Payments: authorized NÃO é pago (autorizado ≠ capturado)', () => {
    // Mutation-test: mapear `authorized` pra 'pago' confirmaria a inscrição de
    // quem só teve o cartão autorizado, sem captura — dinheiro que não entrou.
    expect(statusCanonico('authorized', 'pending_capture', STATUS_POR_PAYMENT))
      .toBe('aguardando_pagamento');
  });

  it('Payments: approved é PAGO e rejected é FALHOU', () => {
    expect(statusCanonico('approved', 'accredited', STATUS_POR_PAYMENT)).toBe('pago');
    expect(statusCanonico('rejected', 'cc_rejected_bad_filled_security_code', STATUS_POR_PAYMENT))
      .toBe('falhou');
  });

  it('partially_refunded vence o status cru nas DUAS APIs', () => {
    // Sem isto, devolução parcial apareceria como pagamento íntegro.
    expect(statusCanonico('processed', 'partially_refunded', STATUS_POR_ORDER))
      .toBe('estornado_parcial');
    expect(statusCanonico('approved', 'partially_refunded', STATUS_POR_PAYMENT))
      .toBe('estornado_parcial');
  });

  it('status desconhecido devolve null (não chuta)', () => {
    expect(statusCanonico('invencionice', null, STATUS_POR_ORDER)).toBeNull();
  });

  it('mapeia as formas do MP pro vocabulário canônico', () => {
    expect(metodoDeMp('pix')).toBe('pix');
    expect(metodoDeMp('bank_transfer')).toBe('pix');
    expect(metodoDeMp('credit_card')).toBe('cartao');
    expect(metodoDeMp('bolbradesco')).toBe('boleto');
    expect(metodoDeMp('nada-disso')).toBeNull();
  });
});

describe('mercadopago · leitura de order e de payment', () => {
  it('order paga devolve valor em centavos e taxa/líquido NULOS', () => {
    // ⚠️ A Orders API não devolve tarifa nem líquido. `null` é a resposta
    // honesta; derivar de tabela de preço nossa violaria a lei nº 6.
    const d = dadosDaOrder({
      id: 'ORD01J', external_reference: 'inscricao:abc',
      transactions: { payments: [{
        id: 'PAY01J', status: 'processed', status_detail: 'accredited',
        amount: '900.00', paid_amount: '900.00',
        payment_method: { id: 'pix', type: 'bank_transfer' },
      }] },
    });
    expect(d.status).toBe('pago');
    expect(d.valor_pago_centavos).toBe(90000);
    expect(d.taxa_centavos).toBeNull();
    expect(d.liquido_centavos).toBeNull();
    expect(d.repassado_em).toBeNull();
    expect(d.referencia).toBe('inscricao:abc');
  });

  it('order NÃO paga não reporta valor pago', () => {
    const d = dadosDaOrder({
      id: 'ORD01J',
      transactions: { payments: [{
        status: 'action_required', status_detail: 'waiting_transfer', amount: '900.00',
        payment_method: { id: 'pix' },
      }] },
    });
    expect(d.status).toBe('aguardando_pagamento');
    expect(d.valor_pago_centavos).toBeNull();
  });

  it('payment (legado) traz taxa somada de fee_details, líquido e data de liberação', () => {
    const d = dadosDoPayment({
      id: 123, status: 'approved', status_detail: 'accredited',
      transaction_amount: 900, installments: 6,
      external_reference: 'inscricao:abc',
      payment_method_id: 'master', payment_type_id: 'credit_card',
      money_release_date: '2026-09-01T10:00:00.000-03:00',
      transaction_details: { total_paid_amount: 900, net_received_amount: 855.18 },
      fee_details: [{ type: 'mercadopago_fee', amount: 44.82 }],
      card: { brand: 'master', last_four_digits: '1234' },
    });
    expect(d.status).toBe('pago');
    expect(d.valor_pago_centavos).toBe(90000);
    expect(d.taxa_centavos).toBe(4482);
    expect(d.liquido_centavos).toBe(85518);
    expect(d.repassado_em).toBe('2026-09-01T10:00:00.000-03:00');
    expect(d.parcelas).toBe(6);
  });

  it('payment sem fee_details devolve taxa NULA em vez de zero', () => {
    // Zero afirmaria "não houve tarifa"; null diz "o PSP não informou". A
    // diferença aparece na conciliação do repasse.
    const d = dadosDoPayment({ id: 1, status: 'approved', transaction_amount: 10 });
    expect(d.taxa_centavos).toBeNull();
  });

  it('NUNCA devolve PAN, CVV, validade ou nome impresso', () => {
    const d = dadosDoPayment({
      id: 1, status: 'approved', transaction_amount: 10,
      card: {
        brand: 'visa', last_four_digits: '4321',
        first_six_digits: '451234',
        expiration_month: 12, expiration_year: 2030,
        cardholder: { name: 'FULANO DE TAL' },
      },
    });
    const texto = JSON.stringify(d);
    expect(d.cartao_last4).toBe('4321');
    expect(texto).not.toMatch(/451234/);
    expect(texto).not.toMatch(/FULANO/);
    expect(texto).not.toMatch(/expiration/);
  });
});

describe('mercadopago · dinheiro e expiração', () => {
  it('converte centavos ↔ reais sem float sujo', () => {
    expect(paraReais(90000)).toBe('900.00');
    expect(paraReais(1)).toBe('0.01');
    expect(paraCentavos('855.18')).toBe(85518);
    expect(paraCentavos(0.07)).toBe(7);
    expect(paraCentavos(null)).toBeNull();
  });

  it('expiração do Pix é ISO 8601 DURATION grampeada na faixa do MP', () => {
    const agora = Date.now();
    // Acima do teto (60 dias) → 30 dias, o máximo que o meio aceita.
    expect(expiracaoPix({ expira_em: new Date(agora + 60 * 24 * 3600e3) })).toBe('PT43200M');
    // Abaixo do piso → 30 min.
    expect(expiracaoPix({ expira_em: new Date(agora + 60e3) })).toBe('PT30M');
    // Sem prazo → o default documentado.
    expect(expiracaoPix({})).toBe('PT24H');
  });
});

describe('mercadopago · capacidades declaradas', () => {
  it('NÃO oferece boleto (falta endereço do pagador no nosso cadastro)', () => {
    // Mutation-test: acrescentar 'boleto' aqui faz a tela abrir uma aba que
    // sempre falha — o MP exige street/number/zip/neighborhood/city/state e
    // `pag_cobrancas` não guarda endereço.
    expect(mp.capacidades.metodos).not.toContain('boleto');
    expect(mp.capacidades.metodos).toEqual(expect.arrayContaining(['pix', 'cartao']));
  });

  it('teto de parcelas é o do Checkout Pro', () => {
    expect(mp.capacidades.parcelas_max).toBe(36);
  });

  it('exporta o contrato inteiro que o núcleo espera', () => {
    for (const fn of ['criarCobranca', 'consultarStatus', 'cancelarCobranca',
      'estornar', 'verificarAssinatura', 'normalizarEvento', 'definirMetodo',
      'verificarChave']) {
      expect(typeof mp[fn], `${fn} deve existir`).toBe('function');
    }
    expect(mp.nome).toBe('mercadopago');
  });
});

describe('mercadopago · webhook precisa buscar o objeto', () => {
  it('tópico orders consulta a order e devolve status canônico', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        id: 'ORD01J', external_reference: 'inscricao:abc',
        transactions: { payments: [{
          id: 'PAY1', status: 'processed', status_detail: 'accredited',
          amount: '900.00', paid_amount: '900.00', payment_method: { id: 'pix' },
        }] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ev = await mp.normalizarEvento(
      { id: 55, type: 'orders', action: 'order.updated', data: { id: 'ORD01J' } },
      {},
    );
    expect(ev.status).toBe('pago');
    expect(ev.evento_id).toBe('orders:55');
    expect(ev.referencia).toBe('inscricao:abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tópico desconhecido devolve null em vez de agir errado', async () => {
    const ev = await mp.normalizarEvento({ type: 'topic_card_id_wh', data: { id: '1' } }, {});
    expect(ev).toBeNull();
  });

  it('notificação sem data.id devolve null', async () => {
    expect(await mp.normalizarEvento({ type: 'payment' }, {})).toBeNull();
  });

  it('a guarda de live_mode vale TAMBÉM na notificação', async () => {
    process.env.MERCADOPAGO_AMBIENTE = 'teste';
    await expect(
      mp.normalizarEvento({ type: 'payment', live_mode: true, data: { id: '1' } }, {}),
    ).rejects.toThrow(/dinheiro real/i);
  });
});
