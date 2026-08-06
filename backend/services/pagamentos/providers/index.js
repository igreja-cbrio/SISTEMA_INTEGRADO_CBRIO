// Registro de providers de pagamento.
//
// É o único lugar do sistema que conhece nome de PSP. Trocar de provedor =
// escrever um adapter novo aqui + mudar `PAG_PROVIDER_PADRAO`. Nenhum módulo
// de domínio importa este arquivo — só `services/pagamentos/index.js`.
//
// ── CONTRATO DE UM ADAPTER ────────────────────────────────────────────────
//
//   nome: string
//   capacidades: { metodos[], parcelas_max, webhook, estorno, consulta_status }
//
//   async criarCobranca(dados) → {
//     provider_cobranca_id, provider_cliente_id?, status,   // status CANÔNICO
//     checkout_url?, pix_payload?, pix_qrcode_base64?,
//     boleto_linha_digitavel?, boleto_url?, vencimento?,
//     metodo?, bruto?                                       // bruto = payload do PSP
//   }
//   async consultarStatus(cobranca) → { status, valor_pago_centavos?, ... } | null
//   async cancelarCobranca(cobranca) → { ok }
//   async estornar(cobranca, { valor_centavos? }) → { ok, provider_pagamento_id? }
//
//   verificarAssinatura(rawBody, headers, segredo) → { ok, motivo? }
//
//   ⚠️ `normalizarEvento` PODE SER ASSÍNCRONO (o chamador dá await). Há PSP cujo
//   webhook não traz o pagamento: o do Mercado Pago manda só `{ data: { id } }`
//   e o adapter precisa buscar o pagamento pra saber status, valor e taxa.
//   normalizarEvento(payload, headers) → {
//     evento_id,            // ID do EVENTO no PSP (é a chave de idempotência)
//     tipo,                 // string do PSP, só pra log
//     provider_cobranca_id, // pra achar a cobrança
//     referencia?,          // fallback quando o PSP ecoa nossa chave
//     status,               // status CANÔNICO já traduzido
//     valor_pago_centavos?, liquido_centavos?, taxa_centavos?,
//     metodo?, parcelas?, cartao_brand?, cartao_last4?,
//     provider_pagamento_id?, e2e_id?, repassado_em?
//   } | null
//
// ⚠️ A tradução de string do PSP → status canônico acontece DENTRO do adapter,
// nunca fora. Se `'RECEIVED'` aparece em qualquer outro arquivo, está errado.

const manual = require('./manual');

const REGISTRO = new Map();
function registrar(adapter) {
  if (!adapter?.nome) throw new Error('provider sem nome');
  REGISTRO.set(adapter.nome, adapter);
}

registrar(manual);

// Adapters de PSP. O `try` cobre só a AUSÊNCIA do arquivo (deploy em que o
// adapter ainda não subiu); erro DENTRO do adapter propaga — silêncio ali
// significaria cobrança criada num provider que não sabe cobrar.
//
// ⚠️ Os dois convivem de propósito. `PAG_PROVIDER_PADRAO` decide quem cobra
// AGORA; o outro segue registrado pra que cobrança ANTIGA continue sendo
// consultada, conciliada e estornada pelo provedor que a criou
// (`pag_cobrancas.provider` é por linha, e é ele que `obter()` recebe). Remover
// o adapter antigo depois de uma troca deixaria as cobranças dele órfãs.
for (const caminho of ['./asaas', './mercadopago']) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    registrar(require(caminho));
  } catch (e) {
    // ⚠️ Só engole "o ARQUIVO DO ADAPTER não existe". `MODULE_NOT_FOUND` cru
    // engoliria também um `require` quebrado DENTRO do adapter — e aí o PSP
    // sumiria do registro em silêncio, com o sistema caindo pro `manual` e
    // recusando todo evento pago sem ninguém entender por quê.
    if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(caminho)) throw e;
  }
}

/** Nome do provider padrão pra cobrança nova (env `PAG_PROVIDER_PADRAO`). */
function providerPadrao() {
  return process.env.PAG_PROVIDER_PADRAO || 'manual';
}

/**
 * Resolve um adapter por nome. Lança quando não existe — silêncio aqui
 * significaria cobrança criada num provider que não sabe cobrar.
 */
function obter(nome) {
  const alvo = nome || providerPadrao();
  const adapter = REGISTRO.get(alvo);
  if (!adapter) {
    throw new Error(
      `Provider de pagamento "${alvo}" não está registrado. `
      + `Disponíveis: ${[...REGISTRO.keys()].join(', ') || '(nenhum)'}.`,
    );
  }
  return adapter;
}

function existe(nome) {
  return REGISTRO.has(nome);
}

/** Provider real (não-manual) configurado? Gate do fluxo pago automático. */
function pspConfigurado() {
  const p = providerPadrao();
  return p !== 'manual' && REGISTRO.has(p);
}

function listar() {
  return [...REGISTRO.values()].map((p) => ({ nome: p.nome, capacidades: p.capacidades }));
}

module.exports = { obter, existe, listar, providerPadrao, pspConfigurado, registrar };
