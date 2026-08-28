// Adapter do Asaas — o PSP escolhido (decisão de 2026-07-28, verificada na
// documentação: Stripe não faz parcelado no Brasil e o Santander não é
// adquirente; parcelar é requisito, então sobra PSP brasileiro único).
//
// ⚠️ ESTE É O ÚNICO ARQUIVO DO SISTEMA QUE CONHECE A LINGUAGEM DO ASAAS.
// String de status do PSP, nome de campo, formato de payload: tudo morre aqui.
// Se `'PAYMENT_RECEIVED'` aparecer em qualquer outro arquivo, está no lugar
// errado (ver tipos.js, lei 2).
//
// ═══ FATOS DA API QUE NÃO SÃO ÓBVIOS (docs.asaas.com) ═══
//
//  1. Autenticação é o header `access_token` (não Bearer). O `User-Agent` é
//     EXIGIDO — sem ele a requisição falha de um jeito difícil de diagnosticar.
//
//  2. A key carrega o ambiente no prefixo: `$aact_hmlg_` = sandbox,
//     `$aact_prod_` = produção. Usamos isso como guarda: key de sandbox em
//     produção (ou o contrário) LANÇA. É a diferença entre "o teste não cobrou"
//     e "o teste cobrou de verdade".
//
//  3. `billingType: 'UNDEFINED'` faz o Asaas montar UMA página (`invoiceUrl`)
//     onde o pagador escolhe Pix, cartão ou boleto. É o checkout hospedado que
//     queremos: um link serve os três, e dado de cartão nunca passa pelo nosso
//     Express.
//
//  4. **`PAYMENT_CONFIRMED` ≠ `PAYMENT_RECEIVED`.** Confirmado = o pagador
//     pagou. Recebido = o dinheiro está disponível na conta — no cartão, ~32
//     dias depois. A PESSOA é confirmada no CONFIRMED (senão quem paga com
//     cartão espera um mês pra entrar na lista do retiro); o DINHEIRO é
//     marcado no RECEIVED (`repassado_em`, que é o que concilia com o extrato).
//
//  5. **Parcelado no cartão vira N cobranças no Asaas**, uma por parcela, cada
//     uma com seu id e seus eventos. Mas o pagador já pagou tudo na primeira
//     autorização. Por isso marcamos `quita_cobranca` na primeira confirmação:
//     sem isso a cobrança ficaria `pago_parcial` por 12 meses e a inscrição
//     nunca seria confirmada.
//
//  6. **A fila de webhook é INTERROMPIDA após 15 falhas consecutivas**, e as
//     pendências ficam guardadas 14 dias. É por isso que `webhooks.js` responde
//     200 pra tudo menos assinatura inválida — e por que token inválido
//     notifica gente na primeira ocorrência.
//
//  7. A verificação do webhook **não é HMAC**: o Asaas devolve, no header
//     `asaas-access-token`, o token que VOCÊ cadastrou no painel. Comparação
//     tem que ser timing-safe.

const crypto = require('crypto');
const { STATUS, METODOS } = require('../tipos');
const { resilientFetch } = require('../../../utils/resilientFetch');

const nome = 'asaas';

const BASE_PROD = 'https://api.asaas.com/v3';
const BASE_SANDBOX = 'https://api-sandbox.asaas.com/v3';

const capacidades = Object.freeze({
  // Boleto e Apple Pay ficam pra fase 2 (boleto prende vaga por dias em evento
  // com data fixa; Apple Pay exige merchant/domínio novo e não faz parcelado).
  metodos: [METODOS.PIX, METODOS.CARTAO, METODOS.BOLETO],
  parcelas_max: 21,
  webhook: true,
  estorno: true,
  consulta_status: true,
});

// ── Configuração ──────────────────────────────────────────────────────────

/**
 * ⚠️ `VERCEL_ENV` vem ANTES de `NODE_ENV`, e não é detalhe: a Vercel define
 * `NODE_ENV=production` em TODO deploy, inclusive **preview**. Olhando só pro
 * NODE_ENV, um preview seria tratado como produção e a guarda abaixo recusaria
 * a key de sandbox — justamente no ambiente onde o sandbox precisa rodar.
 *
 * VERCEL_ENV distingue production | preview | development. Sem ela (rodando
 * local ou fora da Vercel), cai no NODE_ENV.
 */
function ehProducao() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production';
  return process.env.NODE_ENV === 'production';
}

function apiKey() {
  const k = process.env.ASAAS_API_KEY;
  if (!k) throw new Error('ASAAS_API_KEY não configurada');

  // Guarda de ambiente. Barata, e evita os dois acidentes que importam:
  // cobrar de verdade num teste, e testar contra dinheiro real.
  const sandbox = k.startsWith('$aact_hmlg_');
  const producao = k.startsWith('$aact_prod_');
  const ambiente = process.env.VERCEL_ENV || process.env.NODE_ENV || 'desconhecido';
  if (ehProducao() && sandbox) {
    throw new Error(`ASAAS_API_KEY é de SANDBOX ($aact_hmlg_) mas o ambiente é PRODUÇÃO (${ambiente}) — nada seria cobrado de verdade.`);
  }
  if (!ehProducao() && producao) {
    throw new Error(`ASAAS_API_KEY é de PRODUÇÃO ($aact_prod_) fora de produção (${ambiente}) — um teste cobraria dinheiro real.`);
  }
  return k;
}

function baseUrl() {
  return process.env.ASAAS_BASE_URL || (ehProducao() ? BASE_PROD : BASE_SANDBOX);
}

// ── Dinheiro: centavos (nosso) ⇄ reais decimais (deles) ───────────────────
// Este é o ÚNICO lugar do núcleo onde float toca dinheiro, porque a API do
// Asaas fala reais com decimais. Sempre com Math.round, e sempre na fronteira.

function paraReais(centavos) {
  return Number((Math.round(Number(centavos) || 0) / 100).toFixed(2));
}

function paraCentavos(reais) {
  if (reais === null || reais === undefined || reais === '') return null;
  return Math.round(Number(reais) * 100);
}

// ── HTTP ──────────────────────────────────────────────────────────────────

async function req(metodo, caminho, corpo) {
  const resp = await resilientFetch(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      // Exigido pelo Asaas. Sem User-Agent a chamada falha sem dizer por quê.
      'User-Agent': `CBRio-ERP/1.0 (Node.js; ${ehProducao() ? 'producao' : 'sandbox'})`,
      access_token: apiKey(),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }, {
    dependency: 'Asaas',
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  const texto = await resp.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }

  if (!resp.ok) {
    // O Asaas devolve { errors: [{ code, description }] }.
    const desc = json?.errors?.map((e) => e.description).filter(Boolean).join(' · ')
      || json?.message || texto?.slice(0, 300) || `HTTP ${resp.status}`;
    const err = new Error(`Asaas ${metodo} ${caminho}: ${desc}`);
    err.status = resp.status;
    err.asaasErrors = json?.errors || null;
    throw err;
  }
  return json;
}

// ── Cliente (o Asaas exige um `customer` na cobrança) ─────────────────────

async function acharOuCriarCliente({ nome: nomePagador, cpf, email, telefone }) {
  const doc = String(cpf || '').replace(/\D/g, '');

  if (doc) {
    // Reusar evita duplicar pessoa no painel do Asaas a cada inscrição.
    const busca = await req('GET', `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`);
    const achado = busca?.data?.[0];
    if (achado?.id) return achado.id;
  }

  const criado = await req('POST', '/customers', {
    name: nomePagador || 'Inscrito',
    cpfCnpj: doc || undefined,
    email: email || undefined,
    mobilePhone: String(telefone || '').replace(/\D/g, '') || undefined,
    notificationDisabled: true,   // quem avisa a pessoa é o CBRio, não o Asaas
  });
  if (!criado?.id) throw new Error('Asaas não devolveu id do cliente');
  return criado.id;
}

// ── Criar cobrança ────────────────────────────────────────────────────────

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * QR do Pix da cobrança. É uma chamada SEPARADA — o `POST /payments` não
 * devolve o QR junto.
 *
 * Serve pra mostrar o Pix DENTRO da nossa página, em vez de mandar a pessoa
 * embora pro checkout hospedado. Pix não é dado sensível; cartão é, e por isso
 * continua no Asaas (lei nº 5).
 *
 * ⚠️ **Best-effort de propósito.** Com `billingType: 'UNDEFINED'` o pagador
 * ainda não escolheu método, então o Asaas pode não ter Pix gerado e responder
 * erro — o que NÃO é motivo pra derrubar uma cobrança que já existe e já
 * reservou vaga. Sem QR, a página cai no checkout hospedado, exatamente como
 * antes desta função existir.
 */
async function buscarPixQrCode(paymentId) {
  if (!paymentId) return null;
  try {
    const qr = await req('GET', `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
    // `success: false` é como o Asaas diz "esta cobrança não tem Pix".
    if (!qr || qr.success === false) return null;
    return {
      payload: qr.payload || null,
      base64: qr.encodedImage || null,
    };
  } catch (e) {
    // Só loga. Cobrança criada não se desfaz porque o QR não veio.
    console.warn(`[asaas] QR do Pix indisponível para ${paymentId}: ${e.message}`);
    return null;
  }
}

async function criarCobranca(dados) {
  const clienteId = dados.provider_cliente_id || await acharOuCriarCliente({
    nome: dados.pagador_nome, cpf: dados.pagador_cpf,
    email: dados.pagador_email, telefone: dados.pagador_telefone,
  });

  // `dueDate` é obrigatório. Usa o vencimento da cobrança; senão o prazo de
  // expiração; senão amanhã (Pix vencido ainda é pagável, então isto é só o
  // rótulo do Asaas — quem expira de verdade é o nosso cron).
  const venc = dados.vencimento
    || (dados.expira_em ? ymd(dados.expira_em) : ymd(new Date(Date.now() + 86400000)));

  const corpo = {
    customer: clienteId,
    // A pessoa escolhe Pix / cartão / boleto na própria página do Asaas.
    billingType: 'UNDEFINED',
    value: paraReais(dados.valor_centavos),
    dueDate: venc,
    description: (dados.descricao || 'Inscrição CBRio').slice(0, 500),
    // Ecoa nossa chave de negócio: o webhook devolve isso e serve de fallback
    // pra achar a cobrança quando o id do provider ainda não foi gravado.
    externalReference: dados.referencia || dados.id || undefined,
  };

  // ⚠️ A cobrança nasce SIMPLES (valor cheio), NUNCA parcelada.
  //
  // Aqui havia um bug de dinheiro: mandávamos `installmentCount = parcelas_max`.
  // Mas `parcelas_max` é **teto de configuração do evento**, não o número de
  // parcelas que alguém escolheu — e a doc do Asaas é explícita de que "apenas
  // cobranças com 2 ou mais parcelas usam os atributos de parcelamento", ou
  // seja, o campo NÃO é ignorado: ele cria o plano. Efeito em cadeia num evento
  // com teto 12: a cobrança nascia como 12 × R$ 75, o QR do Pix saía com R$ 75
  // enquanto a tela mostrava R$ 900, e o pagamento da 1ª parcela caía no
  // `quita_cobranca` → inscrição CONFIRMADA tendo pago 1/12.
  //
  // Quem escolhe parcela é a PESSOA, na tela, e o número dela vai no
  // `definirMetodo` (só no cartão). `parcelas_max` volta a ser o que o resto do
  // sistema diz que ele é: um teto.

  const p = await req('POST', '/payments', corpo);

  // Uma chamada extra pra poder desenhar o Pix na nossa página. Best-effort:
  // ver `buscarPixQrCode`. Parcelado é cartão, então lá o QR simplesmente não
  // vem — e não faz falta.
  const pix = await buscarPixQrCode(p.id);

  return {
    provider_cobranca_id: p.id,
    provider_cliente_id: clienteId,
    // Nasce aguardando: a cobrança existe e está esperando o pagador.
    status: STATUS.AGUARDANDO,
    checkout_url: p.invoiceUrl || null,
    pix_payload: pix?.payload || null,
    pix_qrcode_base64: pix?.base64 || null,
    boleto_linha_digitavel: p.identificationField || null,
    boleto_url: p.bankSlipUrl || null,
    vencimento: p.dueDate || venc,
    metodo: null,               // só se sabe quando a pessoa escolhe
    bruto: p,
  };
}

// ── Escolher a forma de pagamento ─────────────────────────────────────────

/**
 * Define no Asaas QUAL é a forma de pagamento desta cobrança e devolve o
 * artefato correspondente (QR do Pix, linha digitável do boleto, checkout do
 * cartão).
 *
 * ⚠️ **Por que isto existe** (aprendido no 1º teste em sandbox, 30/07):
 * `billingType: 'UNDEFINED'` NÃO garante que a fatura hospedada ofereça as
 * três formas — o Asaas monta a página com o que a CONTA tem habilitado, e uma
 * conta sem chave Pix cadastrada rende uma fatura **só de boleto**. Nossa tela
 * então oferecia abas de Pix e cartão que não existiam do outro lado.
 *
 * Dizer o método explicitamente troca o palpite por um fato: se a conta não
 * pode cobrar por aquele meio, o Asaas responde erro AQUI, na hora da escolha,
 * e a tela conta a verdade em vez de levar a pessoa a uma fatura errada.
 *
 * Não mexe em valor nem em vencimento — só na forma. E é idempotente: pedir
 * Pix duas vezes devolve o mesmo QR.
 */
const BILLING_POR_METODO = {
  [METODOS.PIX]: 'PIX',
  [METODOS.CARTAO]: 'CREDIT_CARD',
  [METODOS.BOLETO]: 'BOLETO',
};

async function definirMetodo(cobranca, metodo, opcoes = {}) {
  const billing = BILLING_POR_METODO[metodo];
  if (!billing) throw new Error(`Asaas não cobra por "${metodo}"`);
  if (!cobranca.provider_cobranca_id) throw new Error('Cobrança sem id no Asaas');

  // Parcelamento SÓ no cartão, e SÓ com o número que a pessoa escolheu. Pix e
  // boleto parcelados fariam o QR/linha sair com o valor de UMA parcela
  // enquanto a tela mostra o total — foi o bug de dinheiro de 30/07.
  const parcelas = metodo === METODOS.CARTAO && Number(opcoes.parcelas) > 1
    ? Math.min(Math.floor(Number(opcoes.parcelas)), capacidades.parcelas_max)
    : null;

  const id = encodeURIComponent(cobranca.provider_cobranca_id);
  const atual = await req('GET', `/payments/${id}`);

  // O update do Asaas exige os campos obrigatórios junto — reenvia os valores
  // que JÁ estão na cobrança (nunca recalcula preço aqui).
  const jaTemParcelas = Number(atual?.installmentCount) || null;
  const precisaTrocarForma = atual?.billingType !== billing;
  const precisaTrocarParcelas = (parcelas || null) !== jaTemParcelas;

  let p = atual;
  if (precisaTrocarForma || precisaTrocarParcelas) {
    const corpo = { billingType: billing, dueDate: atual.dueDate };
    if (parcelas) {
      // `totalValue` = o valor CHEIO; o Asaas divide e ajusta a sobra na última
      // parcela. Nunca mandamos `value` junto (seria o valor da parcela).
      corpo.installmentCount = parcelas;
      corpo.totalValue = paraReais(cobranca.valor_centavos);
    } else {
      // Voltar pra 1x (ou trocar pra Pix/boleto) precisa DESFAZER o plano:
      // mandar só `value` sem installmentCount é o que o Asaas entende como
      // cobrança simples.
      corpo.value = paraReais(cobranca.valor_centavos);
      corpo.installmentCount = null;
    }
    p = await req('PUT', `/payments/${id}`, corpo);
  }

  // ⚠️ A forma é a que o Asaas CONFIRMOU, não a que pedimos (lei nº 2: status/
  // forma canônica é mapeada do que o PSP diz). Se ele responder 200 mantendo o
  // billingType antigo — conta sem aquele meio habilitado, por exemplo —, gravar
  // o pedido faria o banco mentir e a tela mostrar "cartão" numa cobrança que
  // continua boleto. Lançar aqui é o que transforma isso em erro visível pra
  // pessoa (o chamador devolve 502 com o estado atual no corpo).
  const confirmado = metodoDeBillingType(p.billingType);
  if (confirmado !== metodo) {
    throw new Error(
      `O Asaas não habilitou ${metodo} nesta cobrança (segue como ${confirmado || p.billingType || 'indefinida'}). `
      + 'Verifique se a forma está ativa na conta.',
    );
  }

  const saida = {
    metodo: confirmado,
    // Quantas parcelas o Asaas de fato registrou (1 = à vista). Mesma régua do
    // `metodo`: vale o que o PSP confirmou, não o que pedimos.
    parcelas: Number(p.installmentCount) || 1,
    checkout_url: p.invoiceUrl || atual.invoiceUrl || null,
    pix_payload: null,
    pix_qrcode_base64: null,
    boleto_linha_digitavel: p.identificationField || null,
    boleto_url: p.bankSlipUrl || null,
  };

  if (metodo === METODOS.PIX) {
    // Aqui NÃO é best-effort: a pessoa pediu Pix. Sem QR, quem chama decide
    // (a tela cai no checkout e diz isso), mas o erro precisa aparecer.
    const qr = await req('GET', `/payments/${id}/pixQrCode`);
    if (qr && qr.success !== false) {
      saida.pix_payload = qr.payload || null;
      saida.pix_qrcode_base64 = qr.encodedImage || null;
    }
  }

  if (metodo === METODOS.BOLETO && !saida.boleto_linha_digitavel) {
    // A linha digitável às vezes só existe numa chamada própria.
    try {
      const linha = await req('GET', `/payments/${id}/identificationField`);
      saida.boleto_linha_digitavel = linha?.identificationField || null;
      saida.boleto_url = saida.boleto_url || linha?.bankSlipUrl || null;
    } catch (e) {
      console.warn(`[asaas] linha digitável indisponível para ${cobranca.provider_cobranca_id}: ${e.message}`);
    }
  }

  return saida;
}

// ── Consultar (o cron de reconciliação é a VERDADE) ───────────────────────

async function consultarStatus(cobranca) {
  if (!cobranca.provider_cobranca_id) return null;
  const p = await req('GET', `/payments/${encodeURIComponent(cobranca.provider_cobranca_id)}`);
  if (!p) return null;

  const st = statusDePagamento(p.status);
  const pago = st === STATUS.PAGO;

  return {
    status: st,
    // Só reporta valor quando de fato foi pago — senão `registrarPagamento`
    // gravaria liquidação de cobrança em aberto.
    valor_pago_centavos: pago ? paraCentavos(p.value) : 0,
    liquido_centavos: pago ? paraCentavos(p.netValue) : null,
    taxa_centavos: pago ? taxaCentavos(p) : null,
    metodo: metodoDeBillingType(p.billingType),
    parcelas: p.installmentCount || null,
    provider_pagamento_id: p.id,
    repassado_em: p.creditDate || null,
    cartao_brand: p.creditCard?.creditCardBrand || null,
    cartao_last4: last4(p.creditCard),
    // ⚠️ Só o CARTÃO quita a cobrança na 1ª parcela — é lá que o pagador
    // autorizou o total. Pix/boleto de uma cobrança parcelada pagam UMA
    // parcela, e tratar isso como quitação confirmava inscrição com 1/N pago.
    quita_cobranca: pago && !!p.installment && p.billingType === 'CREDIT_CARD',
    bruto: p,
  };
}

async function cancelarCobranca(cobranca) {
  if (!cobranca.provider_cobranca_id) return { ok: true };
  await req('DELETE', `/payments/${encodeURIComponent(cobranca.provider_cobranca_id)}`);
  return { ok: true };
}

async function estornar(cobranca, { valor_centavos } = {}) {
  const corpo = {};
  if (Number(valor_centavos) > 0 && Number(valor_centavos) < cobranca.valor_pago_centavos) {
    corpo.value = paraReais(valor_centavos);   // estorno parcial
  }
  const r = await req('POST', `/payments/${encodeURIComponent(cobranca.provider_cobranca_id)}/refund`, corpo);
  return { ok: true, provider_pagamento_id: r?.id || null, bruto: r };
}

// ── Webhook ───────────────────────────────────────────────────────────────

/**
 * ⚠️ NÃO é HMAC. O Asaas devolve, no header `asaas-access-token`, o token que
 * cadastramos no painel — então a verificação é comparar dois segredos, em
 * tempo constante. `rawBody` fica sem uso aqui de propósito (o contrato do
 * adapter o recebe porque outros PSPs assinam o corpo).
 */
function verificarAssinatura(_rawBody, headers, segredo) {
  if (!segredo) {
    // Fail-closed: sem segredo configurado, qualquer um poderia postar
    // "pagamento aprovado".
    return { ok: false, motivo: 'ASAAS_WEBHOOK_SECRET não configurado' };
  }
  const recebido = headers?.['asaas-access-token'] || headers?.['Asaas-Access-Token'];
  if (!recebido) return { ok: false, motivo: 'header asaas-access-token ausente' };

  const a = Buffer.from(String(recebido));
  const b = Buffer.from(String(segredo));
  // timingSafeEqual exige mesmo tamanho; comparar o tamanho antes não vaza
  // nada de útil (o tamanho do token não é secreto).
  if (a.length !== b.length) return { ok: false, motivo: 'token divergente' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, motivo: 'token divergente' };
  return { ok: true };
}

const METODO_POR_BILLING = {
  PIX: METODOS.PIX,
  BOLETO: METODOS.BOLETO,
  CREDIT_CARD: METODOS.CARTAO,
  DEBIT_CARD: METODOS.CARTAO,
  TRANSFER: METODOS.TRANSFERENCIA,
  UNDEFINED: null,   // a pessoa ainda não escolheu
};
function metodoDeBillingType(bt) {
  return METODO_POR_BILLING[bt] || null;
}

// Status do OBJETO payment (usado na consulta; o webhook usa o tipo do evento).
const STATUS_POR_PAYMENT = {
  PENDING: STATUS.AGUARDANDO,
  AWAITING_RISK_ANALYSIS: STATUS.AGUARDANDO,
  // Vencido no Asaas NÃO é expirado nosso: Pix e boleto seguem pagáveis, e
  // quem decide expirar (liberando a vaga) é o nosso cron, pelo `expira_em`.
  OVERDUE: STATUS.AGUARDANDO,
  CONFIRMED: STATUS.PAGO,
  RECEIVED: STATUS.PAGO,
  RECEIVED_IN_CASH: STATUS.PAGO,
  REFUNDED: STATUS.ESTORNADO,
  REFUND_REQUESTED: STATUS.PAGO,        // ainda não voltou; só quando concluir
  PARTIALLY_REFUNDED: STATUS.ESTORNADO_PARCIAL,
  CHARGEBACK_REQUESTED: STATUS.CHARGEBACK,
  CHARGEBACK_DISPUTE: STATUS.CHARGEBACK,
  AWAITING_CHARGEBACK_REVERSAL: STATUS.CHARGEBACK,
  DUNNING_REQUESTED: STATUS.AGUARDANDO,
  DUNNING_RECEIVED: STATUS.PAGO,
  AWAITING_CASH_PAYMENT: STATUS.AGUARDANDO,
  DELETED: STATUS.CANCELADA,
};
function statusDePagamento(s) {
  return STATUS_POR_PAYMENT[s] || null;
}

// Status pelo TIPO DO EVENTO do webhook. É este o mapa que decide o efeito.
const STATUS_POR_EVENTO = {
  PAYMENT_CREATED: STATUS.AGUARDANDO,
  PAYMENT_AWAITING_RISK_ANALYSIS: STATUS.AGUARDANDO,
  PAYMENT_UPDATED: null,                 // só metadado; não muda estado
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: STATUS.CHARGEBACK,

  // A pessoa pagou → confirma a INSCRIÇÃO agora.
  PAYMENT_CONFIRMED: STATUS.PAGO,
  // O dinheiro caiu → é aqui que `repassado_em` é preenchido. No cartão isso
  // chega ~32 dias depois do CONFIRMED; a inscrição já está confirmada.
  PAYMENT_RECEIVED: STATUS.PAGO,
  PAYMENT_RECEIVED_IN_CASH: STATUS.PAGO,
  PAYMENT_ANTICIPATED: STATUS.PAGO,

  // Vencido NÃO expira nada (ver comentário no mapa acima).
  PAYMENT_OVERDUE: null,

  PAYMENT_REPROVED_BY_RISK_ANALYSIS: STATUS.FALHOU,
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: STATUS.FALHOU,
  PAYMENT_DELETED: STATUS.CANCELADA,
  PAYMENT_RESTORED: STATUS.AGUARDANDO,

  PAYMENT_REFUNDED: STATUS.ESTORNADO,
  PAYMENT_PARTIALLY_REFUNDED: STATUS.ESTORNADO_PARCIAL,
  PAYMENT_REFUND_IN_PROGRESS: null,      // esperar concluir
  PAYMENT_REFUND_DENIED: null,
  PAYMENT_CHARGEBACK_REQUESTED: STATUS.CHARGEBACK,
  PAYMENT_CHARGEBACK_DISPUTE: STATUS.CHARGEBACK,
};

// Eventos em que o dinheiro efetivamente entrou (viram linha de liquidação).
const EVENTOS_COM_DINHEIRO = new Set([
  'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH',
  'PAYMENT_ANTICIPATED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
]);

/**
 * Taxa a partir do payload. Não é "calculada" no sentido proibido pela lei 6 —
 * é a única forma como o Asaas expressa a tarifa: `value` (bruto) menos
 * `netValue` (líquido), os dois vindos dele. Nunca de tabela de preço nossa.
 */
function taxaCentavos(p) {
  const bruto = paraCentavos(p.value);
  const liquido = paraCentavos(p.netValue);
  if (bruto == null || liquido == null) return null;
  return Math.max(0, bruto - liquido);
}

function last4(cc) {
  if (!cc) return null;
  const n = String(cc.creditCardNumber || '').replace(/\D/g, '');
  return n.length >= 4 ? n.slice(-4) : null;
}

function normalizarEvento(payload) {
  const p = payload?.payment;
  if (!payload?.event || !p) return null;

  const tipo = String(payload.event);
  const status = STATUS_POR_EVENTO[tipo];
  const comDinheiro = EVENTOS_COM_DINHEIRO.has(tipo);

  return {
    // Id DO EVENTO (evt_...), não do pagamento: é a chave da UNIQUE
    // (provider, evento_id) que nos dá idempotência. Quando o Asaas não mandar
    // id de evento, compõe um estável a partir de (tipo + pagamento) — assim a
    // reentrega do MESMO fato ainda é reconhecida como duplicada.
    evento_id: payload.id || `${tipo}:${p.id}`,
    tipo,
    provider_cobranca_id: p.id,
    // Em parcelado, o id do plano é o vínculo entre as N cobranças. Guardado
    // pra rastreabilidade.
    provider_installment_id: p.installment || null,
    referencia: p.externalReference || null,
    status: status === undefined ? null : status,

    valor_pago_centavos: comDinheiro ? paraCentavos(p.value) : 0,
    liquido_centavos: comDinheiro ? paraCentavos(p.netValue) : null,
    taxa_centavos: comDinheiro ? taxaCentavos(p) : null,

    metodo: metodoDeBillingType(p.billingType),
    parcelas: p.installmentCount || null,
    parcela_numero: p.installmentNumber || null,

    provider_pagamento_id: p.id,   // idempotência da liquidação (webhook + cron)
    e2e_id: p.pixTransaction?.endToEndIdentifier || p.pixTransaction || null,
    // `creditDate` é quando o valor fica disponível — é o que amarra o repasse
    // ao crédito no extrato do Santander.
    repassado_em: p.creditDate || null,

    cartao_brand: p.creditCard?.creditCardBrand || null,
    cartao_last4: last4(p.creditCard),

    // ⚠️ Parcelado vira N cobranças no Asaas, mas o pagador pagou tudo na
    // primeira autorização. Sem isto, a soma das liquidações só fecharia em 12
    // meses e a cobrança ficaria `pago_parcial` — inscrição nunca confirmada.
    quita_cobranca: !!p.installment && p.billingType === 'CREDIT_CARD'
      && (tipo === 'PAYMENT_CONFIRMED' || tipo === 'PAYMENT_RECEIVED'),
  };
}

/**
 * Sonda de saúde da CREDENCIAL (não do pagamento).
 *
 * Existe porque o Asaas desabilita chave sem uso em 3 meses e a expira em 6 —
 * e nós só chamamos a API quando há cobrança. Sem isto, um intervalo grande
 * entre eventos pagos mata a chave em silêncio.
 *
 * ⚠️ Usa `GET /customers?limit=1` DE PROPÓSITO: é endpoint que este adapter já
 * exercita em `acharOuCriarCliente`, então sabemos que existe e que responde
 * com esta credencial. A alternativa (`/myAccount`) seria chutar rota nunca
 * testada — e sonda de saúde que falha por si mesma é pior que sonda nenhuma.
 *
 * Read-only e barata: não cria, não altera, não move dinheiro.
 */
async function verificarChave() {
  const t0 = Date.now();
  await req('GET', '/customers?limit=1');
  return { ok: true, latencia_ms: Date.now() - t0 };
}

module.exports = {
  nome,
  capacidades,
  criarCobranca,
  definirMetodo,
  consultarStatus,
  cancelarCobranca,
  estornar,
  verificarAssinatura,
  normalizarEvento,
  verificarChave,
  // exportados pra teste
  _internos: {
    paraReais, paraCentavos, taxaCentavos, last4,
    statusDePagamento, metodoDeBillingType, buscarPixQrCode, BILLING_POR_METODO,
    STATUS_POR_EVENTO, EVENTOS_COM_DINHEIRO, BASE_PROD, BASE_SANDBOX,
  },
};
