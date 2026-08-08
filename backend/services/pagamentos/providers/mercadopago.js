// ============================================================================
// Adapter do MERCADO PAGO.
//
// É o ÚNICO arquivo do sistema que conhece a linguagem do Mercado Pago. String
// de status do PSP, nome de campo, formato de payload: tudo morre aqui.
// `'accredited'` em qualquer outro arquivo é bug de arquitetura (lei nº 2).
//
// ── FATOS DA API QUE NÃO SÃO ÓBVIOS (verificados na doc oficial em 05/08/2026,
//    não de memória) — e cujo desconhecimento custa caro ──
//
// 1. ⚠️ EXISTEM DUAS APIs, com VOCABULÁRIO DE STATUS DIFERENTE.
//    · Orders API   → POST /v1/orders      (a RECOMENDADA pra integração nova)
//    · Payments API → POST /v1/payments    (marcada "legacy" na doc: segue
//      funcionando, mas "will not receive new features, only security and
//      stability fixes". Sem data de sunset publicada.)
//    Não são intercambiáveis: `processed/accredited` (orders) é o equivalente
//    de `approved/accredited` (payments). Este adapter usa a Orders API pra
//    ESCREVER e lê as duas, porque o webhook chega nos dois tópicos (item 4).
//
// 2. ⚠️⚠️ A ORDERS API NÃO DEVOLVE TAXA, LÍQUIDO NEM DATA DE LIBERAÇÃO.
//    O schema de `transactions.payments[]` tem amount/paid_amount/status/
//    payment_method/discounts — e nada de tarifa. A API LEGADA tem
//    `fee_details`, `transaction_details.net_received_amount` e
//    `money_release_date`.
//    Consequência prática, e ela é DECLARADA em vez de contornada: pagamento
//    que chega pela Orders API entra na razão auxiliar com
//    `taxa_centavos: null` e `liquido_centavos: null` — que é a resposta
//    HONESTA ("o PSP não nos disse"), e não viola a lei nº 6 (que proíbe
//    CALCULAR taxa, não proíbe não tê-la). Pagamento que chega pelo tópico
//    `payment` (Checkout Pro) traz os dois, e aí eles são usados.
//    ⚠️ Isso significa que a conciliação automática da TARIFA não fica de pé
//    só com este adapter. Ver o bloco de pendências no CLAUDE.md.
//
// 3. ⚠️⚠️ NENHUM PREFIXO DISTINGUE TOKEN DE TESTE DE TOKEN DE PRODUÇÃO.
//    Citação literal da doc: "The test Access Token starts with the prefix
//    `APP_USR`, just like your production Access Token."
//    Isso MATA a guarda do adapter do Asaas (que compara `$aact_hmlg_` ×
//    `$aact_prod_` e falha na primeira chamada). Aqui a guarda é outra, em
//    duas partes: (a) env EXPLÍCITA `MERCADOPAGO_AMBIENTE` declara a intenção;
//    (b) `live_mode`, que vem em toda resposta e em todo webhook, é conferido
//    contra ela — divergiu, LANÇA. É a diferença entre "o teste não cobrou" e
//    "o teste cobrou de verdade", e sem (b) só se descobre pelo extrato.
//
// 4. ⚠️ O WEBHOOK CHEGA EM DOIS TÓPICOS, e assinar só um deixa metade mudo:
//    · `orders`  → Pix e boleto criados por nós via Orders API
//    · `payment` → quem pagou pelo checkout hospedado (preference/Checkout Pro)
//    Os dois precisam estar marcados no painel do MP.
//
// 5. A validação da assinatura NÃO é o corpo assinado. O MP manda
//    `x-signature: ts=<epoch>,v1=<hex>` + `x-request-id`, e o manifesto é um
//    TEMPLATE com o `data.id` vindo do QUERY STRING da URL (não do corpo):
//        id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//    HMAC-SHA256 hex do template com o secret. ⚠️ O `;` final faz parte, e
//    ⚠️ "if data.id is returned with uppercase alphanumeric characters,
//    convert it to lowercase" — os ids da Orders API são ULIDs MAIÚSCULOS
//    (`ORD01J...`), então minusculizar é o caso NORMAL, não a exceção.
//
// 6. `X-Idempotency-Key` é OBRIGATÓRIO em POST /v1/orders, /cancel e /refund.
//    Sem ele, retry de rede vira cobrança duplicada.
//
// 7. ⚠️ BOLETO EXIGE ENDEREÇO COMPLETO do pagador (street_name, street_number,
//    zip_code, neighborhood, city, state) — e `pag_cobrancas` NÃO guarda
//    endereço. Por isso boleto está FORA de `capacidades.metodos`: a fachada
//    consulta as capacidades pra decidir o que oferecer na tela, e oferecer uma
//    aba que sempre falha é pior que não oferecer (é a mesma razão pela qual o
//    provider `manual` declara só o que sabe fazer).
//
// 8. Cancelar (`/cancel`) só aceita order em `created` ou `action_required` —
//    fora disso o MP devolve 409 `cannot_cancel_order`. Estorno tem prazo de
//    180 dias e exige saldo na conta.
//
// 9. PAN NUNCA passa por aqui, nos dois caminhos. No checkout hospedado o
//    cartão é digitado no domínio do MP; no Checkout Transparente (não usado
//    ainda) o browser tokeniza direto com o MP via Public Key. Lei nº 5.
// ============================================================================

const crypto = require('crypto');
const { STATUS, METODOS } = require('../tipos');

const nome = 'mercadopago';

const BASE = 'https://api.mercadopago.com';

// ⚠️ Boleto fora de propósito — ver fato nº 7 no cabeçalho.
const capacidades = Object.freeze({
  metodos: [METODOS.PIX, METODOS.CARTAO],
  parcelas_max: 36,        // teto do Checkout Pro (1–36; fora disso o MP recusa)
  // O cartão pode ser cobrado SEM redirecionar: o Brick tokeniza no navegador e
  // o servidor recebe só o token. Quem lê esta flag é a tela, pra decidir entre
  // formulário próprio e o checkout hospedado — nunca pra assumir que o PAN
  // pode passar por aqui (lei nº 5 segue valendo: o que chega é token).
  tokenizacao: true,
  webhook: true,
  estorno: true,
  consulta_status: true,
});

// ── Ambiente e credencial ──────────────────────────────────────────────────

/**
 * Ambiente DECLARADO. Não é derivável do token (fato nº 3), então é env
 * explícita, com o mesmo default do resto do núcleo: produção só quando o
 * deploy é produção.
 *
 * ⚠️ `VERCEL_ENV` ANTES de `NODE_ENV`: a Vercel define NODE_ENV=production em
 * TODO deploy, inclusive preview — só pelo NODE_ENV o preview se declararia
 * produção, que é exatamente o ambiente onde queremos o sandbox.
 */
function ambienteDeclarado() {
  const env = String(process.env.MERCADOPAGO_AMBIENTE || '').trim().toLowerCase();
  if (env === 'producao' || env === 'production') return 'producao';
  if (env === 'teste' || env === 'test' || env === 'sandbox') return 'teste';
  const vercel = process.env.VERCEL_ENV;
  if (vercel) return vercel === 'production' ? 'producao' : 'teste';
  return process.env.NODE_ENV === 'production' ? 'producao' : 'teste';
}

function ehProducao() {
  return ambienteDeclarado() === 'producao';
}

function accessToken() {
  const t = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!t) {
    throw new Error(
      'MERCADOPAGO_ACCESS_TOKEN não configurado — o provider mercadopago não '
      + 'consegue cobrar. (Sem a env, mantenha PAG_PROVIDER_PADRAO=manual.)',
    );
  }
  conferirConta(t);
  return t;
}

/**
 * ⚠️⚠️ A GUARDA DE CONTA — a que substitui a de ambiente quando o sandbox passa
 * a usar credencial de PRODUÇÃO de conta de teste.
 *
 * Contexto (08/08/2026): o Mercado Pago aposentou as credenciais de teste na
 * Orders API ("Test credentials are not supported, use test users with
 * production credentials"). Isso obriga o preview a rodar com
 * `MERCADOPAGO_AMBIENTE=producao` — e **neutraliza a guarda de `live_mode`**,
 * que era o que impedia o ensaio de cobrar de verdade. Sem nada no lugar, um
 * Access Token da conta REAL da igreja colado no preview cobraria cartão de
 * gente.
 *
 * O sinal que sobra é a própria credencial: o ÚLTIMO segmento do Access Token do
 * MP é o **id da conta** (`APP_USR-<app>-<data>-<hash>-<userId>`). Então a
 * conferência é de igualdade contra `MERCADOPAGO_CONTA_ID`, setada por escopo:
 * em Production o id da conta da igreja; em Preview o do vendedor de teste.
 * Trocar a chave sem trocar o escopo passa a LANÇAR em vez de cobrar.
 *
 * ⚠️ Fail-OPEN em dois casos, de propósito (mesma régua do `live_mode`): env
 * ausente e token em formato que não expõe o id. Inventar erro onde não há sinal
 * derrubaria o pagamento por nada — e produção rodou meses sem esta env.
 */
function conferirConta(token) {
  const esperada = String(process.env.MERCADOPAGO_CONTA_ID || '').replace(/\D/g, '');
  if (!esperada) return;
  // ⚠️ Credencial de TESTE (`TEST-…`) não passa por aqui, e isso não afrouxa a
  // guarda: ela existe pra impedir COBRANÇA REAL num ambiente de ensaio, e token
  // de teste não move dinheiro de conta nenhuma. Sem esta saída, testar cartão
  // seria impossível — a doc do MP manda usar as credenciais de TESTE da conta
  // REAL pra cartão (ver o cabeçalho), e o id delas é o da conta da igreja, que
  // é justamente o que a guarda recusa quando o token é de produção.
  if (String(token).startsWith('TEST-')) return;
  const partes = String(token).split('-');
  const daChave = String(partes[partes.length - 1] || '').replace(/\D/g, '');
  if (!daChave) return;
  if (daChave === esperada) return;
  throw new Error(
    'Mercado Pago: o Access Token é da conta ' + daChave + ', mas este ambiente '
    + 'está declarado para a conta ' + esperada + ' (MERCADOPAGO_CONTA_ID). '
    + '⚠️ Credencial da conta REAL num ambiente de ensaio cobraria dinheiro de '
    + 'verdade — troque a chave ou o escopo da env antes de seguir.',
  );
}

/**
 * ⚠️ A GUARDA DE AMBIENTE DO MERCADO PAGO. Não existe prefixo pra conferir no
 * boot (fato nº 3), então o sinal é o `live_mode` que vem na resposta — o que
 * torna esta conferência OBRIGATÓRIA em todo lugar que recebe payload do MP.
 *
 * Os dois lados são fatais, por motivos opostos:
 *   · produção com token de teste → a pessoa "paga" e nenhum dinheiro entra;
 *   · teste com token de produção → o ensaio cobra de verdade.
 *
 * `live_mode` ausente não é motivo pra recusar: nem toda resposta o traz, e
 * inventar erro onde não há sinal quebraria o fluxo por nada.
 */
function conferirLiveMode(payload, contexto = 'resposta') {
  if (!payload || typeof payload !== 'object') return;
  const live = payload.live_mode;
  if (typeof live !== 'boolean') return;
  const producao = ehProducao();
  if (live === producao) return;
  throw new Error(
    `Mercado Pago: ambiente declarado é "${ambienteDeclarado()}" mas a ${contexto} veio com `
    + `live_mode=${live}. ${producao
      ? 'O token configurado é de TESTE em produção — ninguém pagaria de verdade.'
      : 'O token configurado é de PRODUÇÃO fora de produção — isto cobraria dinheiro real.'}`,
  );
}

// ── Dinheiro ───────────────────────────────────────────────────────────────
// Fronteira única entre nossos centavos inteiros (lei nº 1) e os reais do MP.

function paraReais(centavos) {
  return (Number(centavos) / 100).toFixed(2);
}

/**
 * O MESMO valor, como NÚMERO.
 *
 * ⚠️⚠️ As duas APIs do MP discordam no tipo do dinheiro, e discordar aqui custa
 * um pagamento: a **Orders API** quer STRING (`total_amount: "5.00"`) e a
 * **Payments API** — que é por onde o cartão do Brick passa — quer NÚMERO, e
 * responde `400 transaction_amount attribute must be numeric` se receber string.
 * Foi exatamente isso que fazia o botão "Pagar" girar e não sair do lugar.
 *
 * Deriva de `paraReais` de propósito: `toFixed(2)` primeiro arredonda em decimal
 * e só depois vira número, então não sobra resíduo binário de `centavos / 100`.
 */
function paraReaisNumero(centavos) {
  return Number(paraReais(centavos));
}

function paraCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  return Math.round(Number(valor) * 100);
}

// ── Referência externa ─────────────────────────────────────────────────────
//
// ⚠️⚠️ O MP RECUSA a nossa `referencia` crua. Doc da Orders API, literal:
// `external_reference` "é obrigatório, com no máximo 64 caracteres, apenas
// letras, números, `-` e `_`". A nossa é `inscricao:<uuid>` — o `:` é inválido,
// e o erro é `400 property_value · '$.external_reference' - does not match
// pattern`, que não diz qual caractere ofende.
//
// ⚠️ A conversão TEM que ser reversível: o `external_reference` é o vínculo
// estável entre a preference e as N orders, e é por ele que o webhook reencontra
// a cobrança quando o id é de outro objeto. Por isso `:` ↔ `_` e nada mais —
// nenhuma referência nossa usa `_`, então a volta é exata.
//
// ⚠️ E não pode conter PII (a doc diz explicitamente). A nossa é
// origem + uuid — nome/CPF/e-mail nunca entram aqui.

const REF_MAX = 64;

function refExterna(referencia, fallbackId) {
  const cru = String(referencia || fallbackId || '');
  const limpo = cru.replace(/:/g, '_').replace(/[^A-Za-z0-9_-]/g, '-');
  if (limpo.length <= REF_MAX) return limpo;
  // Não deveria acontecer com os formatos de hoje (o maior tem 56). Se um
  // domínio novo estourar, o FIM é o que carrega a unicidade — e o aviso existe
  // pra alguém encurtar a referência na origem em vez de descobrir pelo webhook
  // que não reencontra a cobrança.
  console.warn(`[mercadopago] external_reference acima de ${REF_MAX} — truncando: ${limpo}`);
  return limpo.slice(-REF_MAX);
}

/** Volta do formato do MP pra nossa `referencia`. */
function refDoExterno(externa) {
  if (!externa) return null;
  return String(externa).replace(/_/g, ':');
}

// ── HTTP ───────────────────────────────────────────────────────────────────

async function req(metodo, caminho, corpo, { idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken()}`,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
  // Obrigatório nos POSTs da Orders API (fato nº 6). Sem ele, um retry de rede
  // vira uma segunda cobrança na conta de quem está pagando.
  if (idempotencyKey) headers['X-Idempotency-Key'] = String(idempotencyKey).slice(0, 64);

  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { /* resposta não-JSON */ }

  if (!r.ok) {
    const detalhe = json?.message || json?.error || txt.slice(0, 300) || `HTTP ${r.status}`;
    // ⚠️ `Unauthorized use of live credentials` é a MAIS confusa das respostas do
    // MP, porque a credencial está válida — o que não bate é o PAR. A Public Key
    // e o Access Token são de UMA aplicação ("cada par de credenciais é único
    // para cada integração", doc de Credenciais): o navegador tokeniza o cartão
    // com a Public Key (conta A) e o servidor tenta cobrar com o Access Token
    // (conta B), e o MP recusa. Acontece sempre que se troca um dos dois e
    // esquece o outro. Sem esta tradução, o sintoma é "o botão gira e nada
    // acontece" e a investigação começa pelo lugar errado.
    const par = /live credentials|invalid.*(public.?key|token)/i.test(String(detalhe));
    // ⚠️ Regra de SANDBOX que não existe em produção: conta de teste do MP só
    // aceita pagador com e-mail `@testuser.com`. Sem esta tradução, o ensaio
    // trava com uma mensagem que parece defeito da integração — e a tentação é
    // "consertar" o código, quando o que muda é o e-mail da inscrição de teste.
    const emailSandbox = /invalid_email_for_sandbox|@testuser\.com/i.test(String(detalhe));
    const err = new Error(
      `Mercado Pago ${metodo} ${caminho} falhou (${r.status}): ${detalhe}`
      + (par && r.status === 401
        ? ' · ⚠️ MERCADOPAGO_PUBLIC_KEY e MERCADOPAGO_ACCESS_TOKEN precisam ser da'
          + ' MESMA aplicação/conta — confira se os dois foram trocados juntos.'
        : '')
      + (emailSandbox
        ? ' · ⚠️ REGRA SÓ DE SANDBOX: em conta de teste o e-mail do pagador tem'
          + ' que terminar em @testuser.com. Isto NÃO vale em produção — não'
          + ' mexa no código por causa disto, use um e-mail de teste na inscrição.'
        : ''),
    );
    err.status = r.status;
    err.corpo = json;
    throw err;
  }

  conferirLiveMode(json);
  return json;
}

// ── Tradução de status: PSP → canônico ─────────────────────────────────────
// ⚠️ Os dois mapas existem porque as duas APIs têm vocabulários diferentes
// (fato nº 1). Misturá-los é como nasce "pago" em cima de pagamento pendente.

/** Orders API — `status` da order/transação. */
const STATUS_POR_ORDER = {
  created: STATUS.CRIADA,
  action_required: STATUS.AGUARDANDO,   // inclui Pix emitido esperando transferência
  processing: STATUS.AGUARDANDO,        // em análise/antifraude: ainda não é dinheiro
  in_review: STATUS.AGUARDANDO,
  processed: STATUS.PAGO,               // "amount has been effectively credited"
  refunded: STATUS.ESTORNADO,
  charged_back: STATUS.CHARGEBACK,
  expired: STATUS.EXPIRADA,
  canceled: STATUS.CANCELADA,
  cancelled: STATUS.CANCELADA,          // grafia alternativa, defensivo
  failed: STATUS.FALHOU,
};

/** Payments API (legada) — `status` do payment. Chega pelo tópico `payment`. */
const STATUS_POR_PAYMENT = {
  pending: STATUS.AGUARDANDO,
  in_process: STATUS.AGUARDANDO,
  authorized: STATUS.AGUARDANDO,        // autorizado ≠ capturado: não é dinheiro
  approved: STATUS.PAGO,
  refunded: STATUS.ESTORNADO,
  charged_back: STATUS.CHARGEBACK,
  cancelled: STATUS.CANCELADA,
  canceled: STATUS.CANCELADA,
  // ⚠️⚠️ RECUSA NÃO É `falhou` — e isto é uma correção deliberada do mapeamento
  // original deste adapter (que trazia `rejected: STATUS.FALHOU`).
  //
  // `falhou` é TERMINAL e ABSORVENTE (`tipos.js:127` · TRANSICOES[falhou] = []).
  // Aplicado numa cobrança, o efeito em cascata é:
  //   1. `definirMetodo` recusa cobrança terminal → a pessoa não consegue nem
  //      tentar outro cartão, nem trocar pro Pix;
  //   2. se ela pagar numa segunda tentativa, o webhook do pagamento aprovado
  //      tenta `falhou → pago`, o trigger do banco RECUSA a transição, e o
  //      resultado é DINHEIRO RECEBIDO COM INSCRIÇÃO NUNCA CONFIRMADA.
  //
  // No MP cada tentativa é um pagamento próprio: uma recusa é o fim daquela
  // TENTATIVA, não da cobrança. `null` = "não mexe no status" — a recusa vira
  // motivo pra tela explicar (ver `pagarComToken`), e a cobrança segue viva.
  // Mesma régua do `PAYMENT_OVERDUE` do Asaas e da lição registrada no plano do
  // TEF ("recusa NÃO muda o status da cobrança").
  rejected: null,
};

/**
 * `processed` + `partially_refunded` é estorno PARCIAL, e o status cru não
 * distingue — quem distingue é o `status_detail`. Sem isto, devolução parcial
 * apareceria como pagamento íntegro.
 */
function statusCanonico(status, detalhe, mapa) {
  if (String(detalhe || '') === 'partially_refunded') return STATUS.ESTORNADO_PARCIAL;
  return mapa[String(status || '').toLowerCase()] || null;
}

const METODO_POR_MP = {
  pix: METODOS.PIX,
  bank_transfer: METODOS.PIX,
  boleto: METODOS.BOLETO,
  bolbradesco: METODOS.BOLETO,
  ticket: METODOS.BOLETO,
  credit_card: METODOS.CARTAO,
  debit_card: METODOS.CARTAO,
};

function metodoDeMp(idOuTipo) {
  return METODO_POR_MP[String(idOuTipo || '').toLowerCase()] || null;
}

// ── Criar cobrança ─────────────────────────────────────────────────────────

function urlBase() {
  const raw = process.env.FRONTEND_URL || process.env.VERCEL_URL || '';
  const u = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : '');
  // Mesma guarda do gruposWhatsapp: link local NUNCA sai pra fora (o MP usa
  // isto em back_urls/notification_url e um localhost ali é entrega perdida).
  if (!u || /localhost|127\.0\.0\.1|0\.0\.0\.0|:\/\/10\.|:\/\/192\.168\./.test(u)) {
    return 'https://cbrio.org';
  }
  return u.replace(/\/$/, '');
}

function payerDaCobranca(c) {
  const payer = { email: c.pagador_email || 'sem-email@cbrio.org' };
  const nomeCompleto = String(c.pagador_nome || '').trim();
  if (nomeCompleto) {
    const partes = nomeCompleto.split(/\s+/);
    payer.first_name = partes[0];
    if (partes.length > 1) payer.last_name = partes.slice(1).join(' ');
  }
  const cpf = String(c.pagador_cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) payer.identification = { type: 'CPF', number: cpf };
  return payer;
}

/**
 * Cria a PREFERENCE (Checkout Pro) — o que dá à cobrança um id do provider e
 * uma URL de checkout que já funciona, ANTES de a pessoa escolher a forma.
 *
 * ⚠️ Por que preference e não order: a Orders API exige o `payment_method` na
 * criação, e neste ponto do fluxo a pessoa ainda não escolheu. Sem um
 * `provider_cobranca_id` aqui, o núcleo trataria a linha como "meio-criada" e
 * a retentaria pra sempre. A order de verdade nasce no `definirMetodo`.
 *
 * ⚠️ O vínculo estável entre TODAS as tentativas (preference + N orders) é o
 * `external_reference` = nossa `referencia`. É por ele que o webhook reencontra
 * a cobrança quando o id do provider é de outro objeto.
 */
async function criarCobranca(c) {
  const base = urlBase();
  const corpo = {
    items: [{
      id: String(c.referencia || c.id),
      title: (c.descricao || 'Inscrição CBRio').slice(0, 250),
      quantity: 1,
      currency_id: 'BRL',
      unit_price: paraReaisNumero(c.valor_centavos),
    }],
    payer: payerDaCobranca(c),
    external_reference: refExterna(c.referencia, c.id),
    notification_url: `${base}/api/pagamentos-webhook/mercadopago`,
    back_urls: {
      success: `${base}/pagamento/${c.public_token}`,
      pending: `${base}/pagamento/${c.public_token}`,
      failure: `${base}/pagamento/${c.public_token}`,
    },
    auto_return: 'approved',
    statement_descriptor: 'CBRIO',
  };

  // Teto de parcelas. `parcelas_max` da cobrança é TETO, nunca plano — quem
  // escolhe quantas é o pagador, na página do MP (mesma lição do Asaas).
  const teto = Number(c.parcelas_max) || capacidades.parcelas_max;
  corpo.payment_methods = { installments: Math.min(Math.max(teto, 1), 36) };

  if (c.expira_em) {
    corpo.expires = true;
    corpo.expiration_date_to = new Date(c.expira_em).toISOString();
  }

  const pref = await req('POST', '/checkout/preferences', corpo);

  // `init_point` é produção, `sandbox_init_point` é teste. Mandar a pessoa pro
  // link errado é ou cobrança real num ensaio, ou "pagamento" que não existe.
  const checkout = ehProducao() ? pref?.init_point : (pref?.sandbox_init_point || pref?.init_point);

  return {
    provider_cobranca_id: pref?.id ? String(pref.id) : null,
    status: STATUS.AGUARDANDO,
    checkout_url: checkout || null,
    // Nada de artefato aqui: Pix/boleto só existem depois da escolha da forma.
    pix_payload: null,
    pix_qrcode_base64: null,
    boleto_linha_digitavel: null,
    boleto_url: null,
    metodo: null,
    bruto: pref,
  };
}

// ── Definir a forma escolhida ──────────────────────────────────────────────

function ehOrderId(id) {
  return /^ORD/i.test(String(id || ''));
}

/**
 * Cria a ORDER de verdade quando a pessoa escolhe Pix (ou devolve o checkout
 * hospedado quando ela escolhe cartão).
 *
 * ⚠️ Devolve `provider_cobranca_id` — o núcleo passa a apontar pra ORDER, que é
 * o objeto consultável (`GET /v1/orders/{id}`); a preference não é. Trocar de
 * forma cria outra order, e isso é seguro porque todas carregam o MESMO
 * `external_reference`: o webhook reencontra a cobrança de qualquer uma delas.
 */
async function definirMetodo(c, metodo, opcoes = {}) {
  if (metodo === METODOS.CARTAO) {
    // Cartão vai pelo checkout hospedado do MP (lei nº 5 — PAN não entra aqui).
    // ⚠️ NÃO devolve `parcelas`: quem escolhe é o pagador na página do MP, e
    // afirmar aqui o que foi PEDIDO violaria "a forma/parcela confirmada é a
    // que o PSP devolveu". O número real chega no webhook (`installments`).
    return { metodo: METODOS.CARTAO, checkout_url: c.checkout_url || null };
  }

  if (metodo !== METODOS.PIX) {
    throw new Error(`Mercado Pago: forma "${metodo}" não é oferecida por este adapter.`);
  }

  const corpo = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: paraReais(c.valor_centavos),
    external_reference: refExterna(c.referencia, c.id),
    payer: payerDaCobranca(c),
    transactions: {
      payments: [{
        amount: paraReais(c.valor_centavos),
        payment_method: { id: 'pix', type: 'bank_transfer' },
        expiration_time: expiracaoPix(c),
      }],
    },
  };

  // Idempotência amarrada à (cobrança + forma + tentativa): reenvio do mesmo
  // clique não cria duas orders, mas trocar de forma e voltar cria uma nova.
  const order = await req('POST', '/v1/orders', corpo, {
    idempotencyKey: `${c.id}:${metodo}:${opcoes.tentativa || 1}`,
  });

  const pg = order?.transactions?.payments?.[0] || {};
  const pm = pg.payment_method || {};

  const confirmado = metodoDeMp(pm.id) || metodoDeMp(pm.type);
  // Mesma guarda do Asaas: se o PSP devolveu 200 com OUTRA forma, gravar a
  // pedida faria a tela e o banco afirmarem algo que o provedor não fez.
  if (confirmado && confirmado !== METODOS.PIX) {
    throw new Error(
      `Mercado Pago confirmou a forma "${confirmado}" para um pedido de Pix — `
      + 'a conta pode estar sem chave Pix habilitada.',
    );
  }
  if (!pm.qr_code) {
    throw new Error(
      'Mercado Pago criou a cobrança mas não devolveu o QR do Pix — confira se a '
      + 'conta tem chave Pix cadastrada no painel.',
    );
  }

  return {
    metodo: METODOS.PIX,
    provider_cobranca_id: order?.id ? String(order.id) : null,
    pix_payload: pm.qr_code,
    pix_qrcode_base64: pm.qr_code_base64 || null,
    checkout_url: pm.ticket_url || null,
  };
}

/**
 * Vencimento do Pix em ISO 8601 DURATION (o MP não aceita timestamp aqui).
 * Faixa aceita: 30 minutos a 30 dias. Fora dela o MP recusa a order inteira,
 * então o valor é grampeado — e não silenciosamente: um evento com janela de
 * pagamento de 60 dias vira 30 dias, que é o máximo que o meio permite.
 */
function expiracaoPix(c) {
  const MIN = 30;
  const MAX = 30 * 24 * 60;
  if (!c.expira_em) return 'PT24H';
  const minutos = Math.round((new Date(c.expira_em).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(minutos)) return 'PT24H';
  return `PT${Math.min(Math.max(minutos, MIN), MAX)}M`;
}

// ── Consultar ──────────────────────────────────────────────────────────────

/**
 * Só a ORDER é consultável. Enquanto a pessoa não escolheu a forma, o
 * `provider_cobranca_id` é a preference — e preference não tem estado de
 * pagamento. Devolver null ali é a resposta honesta ("nada mudou que eu possa
 * ver"), e o núcleo trata null como "sem novidade".
 */
async function consultarStatus(c) {
  const id = c.provider_cobranca_id;
  if (!id || !ehOrderId(id)) return null;

  const order = await req('GET', `/v1/orders/${encodeURIComponent(id)}`);
  return dadosDaOrder(order);
}

function dadosDaOrder(order) {
  if (!order) return null;
  const pg = order?.transactions?.payments?.[0] || {};
  const status = statusCanonico(
    pg.status || order.status,
    pg.status_detail || order.status_detail,
    STATUS_POR_ORDER,
  );
  if (!status) return null;

  const pago = paraCentavos(pg.paid_amount ?? pg.amount ?? order.total_amount);
  return {
    status,
    provider_pagamento_id: pg.id ? String(pg.id) : null,
    valor_pago_centavos: status === STATUS.PAGO || status === STATUS.PAGO_PARCIAL ? pago : null,
    // ⚠️ Orders API não devolve tarifa nem líquido (fato nº 2). `null` é a
    // resposta honesta — nunca derivar de tabela de preço nossa (lei nº 6).
    taxa_centavos: null,
    liquido_centavos: null,
    repassado_em: null,
    metodo: metodoDeMp(pg.payment_method?.id) || metodoDeMp(pg.payment_method?.type) || null,
    referencia: refDoExterno(order.external_reference),
  };
}

// ── Cancelar e estornar ────────────────────────────────────────────────────

async function cancelarCobranca(c) {
  const id = c.provider_cobranca_id;
  // Preference não se cancela por API; ela expira sozinha. Cobrança sem order
  // criada não tem nada pendente do lado do MP.
  if (!id || !ehOrderId(id)) return { ok: true, motivo: 'sem_order_no_provider' };

  try {
    await req('POST', `/v1/orders/${encodeURIComponent(id)}/cancel`, {}, {
      idempotencyKey: `cancel:${c.id}`,
    });
    return { ok: true };
  } catch (e) {
    // 409 `cannot_cancel_order`: a order já saiu de `created`/`action_required`
    // (fato nº 8). Não é falha nossa e não deve derrubar o fluxo de cancelamento
    // do domínio — quem tem dinheiro dentro é estornado, não cancelado.
    if (e.status === 409) return { ok: false, motivo: 'nao_cancelavel_no_provider' };
    throw e;
  }
}

async function estornar(c, { valor_centavos } = {}) {
  const id = c.provider_cobranca_id;
  if (!id || !ehOrderId(id)) {
    throw new Error('Mercado Pago: não há order no provider para estornar.');
  }

  // Total: `transactions: []`. Parcial exige o id da TRANSAÇÃO (não o da order),
  // que só temos consultando — por isso a consulta vem antes.
  let corpo = { transactions: [] };
  if (valor_centavos) {
    const atual = await req('GET', `/v1/orders/${encodeURIComponent(id)}`);
    const pgId = atual?.transactions?.payments?.[0]?.id;
    if (!pgId) throw new Error('Mercado Pago: order sem transação para estorno parcial.');
    corpo = { transactions: [{ id: String(pgId), amount: paraReais(valor_centavos) }] };
  }

  const r = await req('POST', `/v1/orders/${encodeURIComponent(id)}/refund`, corpo, {
    idempotencyKey: `refund:${c.id}:${valor_centavos || 'total'}`,
  });
  const refund = r?.transactions?.refunds?.[0] || {};
  return { ok: true, provider_pagamento_id: refund.id ? String(refund.id) : null };
}

// ── Webhook ────────────────────────────────────────────────────────────────

/**
 * Assinatura do Mercado Pago (fato nº 5). NÃO é o corpo assinado: o manifesto é
 * montado com o `data.id` do QUERY STRING, o `x-request-id` e o `ts` do próprio
 * header — nesta ordem, com `;` no fim.
 *
 * Fail-closed sem segredo: sem ele, TODO webhook é recusado. É deliberado —
 * aceitar entrega não verificada é aceitar que qualquer um confirme pagamento.
 */
function verificarAssinatura(_rawBody, headers = {}, segredo, extras = {}) {
  if (!segredo) {
    return { ok: false, motivo: 'MERCADOPAGO_WEBHOOK_SECRET não configurado' };
  }

  const assinatura = headers['x-signature'] || headers['X-Signature'];
  const requestId = headers['x-request-id'] || headers['X-Request-Id'] || '';
  if (!assinatura) return { ok: false, motivo: 'header x-signature ausente' };

  let ts = null;
  let v1 = null;
  for (const parte of String(assinatura).split(',')) {
    const [k, ...resto] = parte.split('=');
    const valor = resto.join('=').trim();
    if (k.trim() === 'ts') ts = valor;
    if (k.trim() === 'v1') v1 = valor;
  }
  if (!ts || !v1) return { ok: false, motivo: 'x-signature sem ts/v1' };

  // ⚠️ `data.id` do QUERY, com fallback pro corpo. Minusculizar é o caso normal:
  // os ids da Orders API são ULIDs maiúsculos e a doc manda converter.
  const idCru = extras.query?.['data.id']
    ?? extras.query?.id
    ?? extras.payload?.data?.id
    ?? '';
  const id = String(idCru).toLowerCase();

  const manifesto = `id:${id};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(String(v1), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'assinatura não confere' };
  }
  return { ok: true };
}

/**
 * O webhook do MP **não carrega o pagamento** — só `{ action, type, data:{id} }`.
 * Por isso este normalizador é ASSÍNCRONO: precisa BUSCAR o objeto pra saber
 * status, valor e (quando existe) taxa.
 *
 * Trata os DOIS tópicos (fato nº 4): `orders` (nosso Pix) e `payment` (quem
 * pagou pelo checkout hospedado). Tópico desconhecido devolve null, e o núcleo
 * registra o evento sem despachar — silêncio aqui é melhor que agir errado.
 */
async function normalizarEvento(payload, headers = {}) {
  conferirLiveMode(payload, 'notificação');

  const tipo = String(payload?.type || payload?.topic || '').toLowerCase();
  const idRecurso = payload?.data?.id ?? payload?.resource;
  if (!idRecurso) return null;

  // `id` da notificação identifica a ENTREGA; é ele que dá idempotência real
  // (a mesma order notifica várias vezes, uma por transição).
  const eventoId = payload?.id
    ? `${tipo}:${payload.id}`
    : `${tipo}:${idRecurso}:${payload?.action || ''}`;

  const comum = {
    evento_id: String(eventoId),
    tipo: String(payload?.action || tipo || 'desconhecido'),
    provider_cobranca_id: String(idRecurso),
  };

  if (tipo === 'orders' || tipo === 'order') {
    const order = await req('GET', `/v1/orders/${encodeURIComponent(idRecurso)}`);
    const d = dadosDaOrder(order);
    if (!d) return null;
    return { ...comum, ...d };
  }

  if (tipo === 'payment') {
    const p = await req('GET', `/v1/payments/${encodeURIComponent(idRecurso)}`);
    return { ...comum, ...dadosDoPayment(p) };
  }

  return null;
}

/**
 * Payments API (legada). É o único caminho que devolve TARIFA, LÍQUIDO e DATA
 * DE LIBERAÇÃO (fato nº 2) — e é por isso que o pagamento por cartão via
 * checkout hospedado alimenta a razão auxiliar melhor que o Pix.
 */
function dadosDoPayment(p) {
  if (!p) return {};
  const status = statusCanonico(p.status, p.status_detail, STATUS_POR_PAYMENT);
  const td = p.transaction_details || {};

  const bruto = paraCentavos(td.total_paid_amount ?? p.transaction_amount);
  const liquido = paraCentavos(td.net_received_amount);
  // ⚠️ Taxa vem SOMADA de `fee_details` (é assim que o MP a expressa), nunca
  // derivada de tabela nossa. Sem `fee_details`, fica null.
  const taxa = Array.isArray(p.fee_details) && p.fee_details.length
    ? p.fee_details.reduce((s, f) => s + (paraCentavos(f.amount) || 0), 0)
    : null;

  return {
    status,
    provider_pagamento_id: p.id ? String(p.id) : null,
    valor_pago_centavos: status === STATUS.PAGO || status === STATUS.PAGO_PARCIAL ? bruto : null,
    liquido_centavos: liquido,
    taxa_centavos: taxa,
    // `money_release_date` é quando o dinheiro fica DISPONÍVEL — é ele que
    // concilia com o crédito do extrato, e não a data do pagamento.
    repassado_em: p.money_release_date || null,
    metodo: metodoDeMp(p.payment_method_id) || metodoDeMp(p.payment_type_id) || null,
    parcelas: Number(p.installments) > 0 ? Number(p.installments) : null,
    cartao_brand: p.card?.brand || p.payment_method_id || null,
    cartao_last4: p.card?.last_four_digits || null,
    referencia: refDoExterno(p.external_reference),
  };
}

// ── Sonda de credencial ────────────────────────────────────────────────────

/**
 * Read-only e barata, no molde da sonda do Asaas. Usa um endpoint que o adapter
 * já exercita implicitamente (métodos de pagamento da conta) em vez de chutar
 * rota nunca testada — sonda que falha por si mesma é pior que sonda nenhuma.
 */
async function verificarChave() {
  const inicio = Date.now();
  try {
    await req('GET', '/v1/payment_methods');
    return { ok: true, status_http: 200, latencia_ms: Date.now() - inicio };
  } catch (e) {
    return {
      ok: false,
      status_http: e.status || null,
      erro: e.message,
      latencia_ms: Date.now() - inicio,
    };
  }
}

/**
 * Cobra o cartão com o TOKEN gerado no navegador (Card Payment Brick).
 *
 * ⚠️ O que chega aqui é `token`, NUNCA número de cartão — a lei nº 5 continua
 * intacta. É essa tokenização que permite o formulário ficar na NOSSA página em
 * vez de mandar a pessoa pro site do provedor.
 *
 * ⚠️ POR QUE `/v1/payments` E NÃO A ORDERS API, contrariando o "escrever pela
 * Orders" do resto deste adapter: é o caminho documentado do Brick, e é o único
 * que devolve `fee_details`, `net_received_amount` e `money_release_date` — os
 * três campos que a Orders API não tem e sem os quais a conciliação da tarifa
 * não fecha. Aqui a exceção COMPRA algo concreto; no Pix não compraria nada.
 *
 * ⚠️ O VALOR VEM DA COBRANÇA, jamais do `transaction_amount` que o Brick
 * manda. O formulário roda no navegador da pessoa: aceitar o valor dele seria
 * deixar qualquer um escolher quanto pagar pela inscrição.
 */
/**
 * Chave PUBLICÁVEL do MP, exigida pelo SDK no navegador pra tokenizar o cartão.
 *
 * ⚠️ Não é segredo — ela é feita pra ficar visível no cliente e não autoriza
 * nada além de gerar token de cartão. O que é segredo é o access token, e esse
 * nunca sai daqui. Mesmo assim vive no adapter, e não numa `VITE_` de build: um
 * único bundle serve produção e preview, então chave embutida em build seria a
 * mesma nos dois ambientes — exatamente o cruzamento que a guarda de ambiente
 * existe pra impedir.
 */
/**
 * Public Key pro Brick tokenizar no navegador.
 *
 * ⚠️⚠️ A CONFERÊNCIA DE PAR, e ela decide se o formulário de cartão sequer
 * aparece. Public Key e Access Token são de UM par (doc de Credenciais: "cada
 * par de credenciais é único para cada integração") e existem em DUAS versões
 * por aplicação — teste (`TEST-…`) e produção (`APP_USR-…`). Misturar as duas
 * versões da MESMA aplicação falha igual a misturar contas: o navegador
 * tokeniza com uma e o servidor cobra com a outra, e o MP responde
 * `401 Unauthorized use of live credentials`.
 *
 * ⚠️ Devolver `null` (em vez de deixar tentar) é deliberado: sem chave o núcleo
 * cai no checkout HOSPEDADO, que precisa só do Access Token e portanto FUNCIONA.
 * Oferecer um formulário que vai dar 401 em 100% das tentativas é a mesma
 * armadilha do boleto sem endereço — aba que sempre falha é pior que aba que
 * não existe.
 */
function chavePublica() {
  const pk = (process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();
  if (!pk) return null;

  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) return pk;   // sem token não há par a conferir

  const versao = (v) => (v.startsWith('TEST-') ? 'teste' : 'producao');
  if (versao(pk) !== versao(token)) {
    console.error(
      '[mercadopago] ⚠️ MERCADOPAGO_PUBLIC_KEY é de ' + versao(pk) + ' e '
      + 'MERCADOPAGO_ACCESS_TOKEN é de ' + versao(token) + '. Os dois têm que ser '
      + 'do MESMO par (mesma aplicação E mesma versão — Credenciais de teste OU '
      + 'de produção). Enquanto divergirem, o cartão na página é desligado e a '
      + 'pessoa segue pelo checkout hospedado.',
    );
    return null;
  }
  return pk;
}

async function pagarComToken(c, dados = {}) {
  const token = String(dados.token || '').trim();
  if (!token) throw new Error('Mercado Pago: token do cartão ausente.');

  const parcelas = Number(dados.installments) > 0 ? Math.floor(Number(dados.installments)) : 1;

  const corpo = {
    // ⚠️ do BANCO, não do cliente.
    // ⚠️ NÚMERO, não string — a Payments API recusa string (ver `paraReaisNumero`).
    transaction_amount: paraReaisNumero(c.valor_centavos),
    token,
    installments: parcelas,
    description: c.descricao || 'Pagamento CBRio',
    external_reference: refExterna(c.referencia, c.id),
    payer: {
      email: dados.payer?.email || c.pagador_email || undefined,
      identification: dados.payer?.identification?.number
        ? {
          type: dados.payer.identification.type || 'CPF',
          number: String(dados.payer.identification.number).replace(/\D/g, ''),
        }
        : undefined,
    },
  };
  // Estes três o Brick resolve e o MP exige do jeito que ele mandou — repetir
  // adivinhação nossa aqui só criaria divergência.
  if (dados.payment_method_id) corpo.payment_method_id = String(dados.payment_method_id);
  if (dados.issuer_id) corpo.issuer_id = String(dados.issuer_id);
  if (dados.payment_method_option_id) corpo.payment_method_option_id = String(dados.payment_method_option_id);

  const p = await req('POST', '/v1/payments', corpo, {
    // Estável por TENTATIVA: retry de rede não cobra duas vezes, e um cartão
    // novo (token novo) é outra tentativa legítima. Token do MP é de uso único,
    // então reenviar o mesmo nunca vira segunda cobrança.
    idempotencyKey: `${c.id}:cartao:${token.slice(0, 12)}`,
  });
  conferirLiveMode(p, 'pagamento com cartão');

  const norm = dadosDoPayment(p);
  return {
    ...norm,
    // Recusa do emissor NÃO é status de cobrança (`falhou` é terminal e
    // tornaria a cobrança irrecuperável — a pessoa não poderia nem tentar outro
    // cartão). Vai como motivo pra tela explicar e deixar tentar de novo.
    recusado: norm.status === null,
    motivo_recusa: norm.status === null
      ? (p?.status_detail || p?.status || 'pagamento não aprovado')
      : null,
  };
}

module.exports = {
  nome,
  capacidades,
  criarCobranca,
  definirMetodo,
  consultarStatus,
  cancelarCobranca,
  estornar,
  pagarComToken,
  chavePublica,
  refExterna,
  refDoExterno,
  verificarAssinatura,
  normalizarEvento,
  verificarChave,
  // exportados para teste
  _internos: {
    ambienteDeclarado,
    conferirLiveMode,
    statusCanonico,
    metodoDeMp,
    dadosDaOrder,
    dadosDoPayment,
    expiracaoPix,
    paraCentavos,
    paraReais,
    STATUS_POR_ORDER,
    STATUS_POR_PAYMENT,
  },
};
