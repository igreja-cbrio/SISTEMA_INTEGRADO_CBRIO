// Vocabulário canônico do núcleo de pagamentos.
//
// ═══ REGRAS QUE SÃO LEI NESTE MÓDULO (não regredir) ═══
//
//  1. DINHEIRO SEMPRE EM CENTAVOS INTEIROS. Nenhum float em nenhum lugar —
//     nem em variável intermediária. Formatar pra exibição é papel da UI.
//
//  2. STATUS É NOSSO, NÃO DO PSP. Todo mapeamento de string do provedor vive
//     em `providers/<nome>.js`. Se você está escrevendo
//     `if (status === 'RECEIVED')` fora de um adapter, está no lugar errado.
//
//  3. NENHUM MÓDULO DE DOMÍNIO IMPORTA `providers/*`. Só a fachada
//     (`services/pagamentos/index.js`). É o que permite trocar de PSP
//     mexendo em 1 arquivo + 1 env.
//
//  4. NUNCA ARMAZENAR PAN / CVV / VALIDADE / NOME IMPRESSO. Só `cartao_brand`
//     e `cartao_last4`, exatamente como o PSP devolveu. Um único
//     `console.log(req.body)` numa rota de cartão põe PAN em log retido — e aí
//     o incidente é reportável.
//
//  5. HANDLER DE DOMÍNIO É IDEMPOTENTE. Ele vai rodar mais de uma vez
//     (reentrega de webhook + cron de reconciliação). Ver `handlers/index.js`.

// ── Métodos de pagamento ──────────────────────────────────────────────────
const METODOS = Object.freeze({
  PIX: 'pix',
  BOLETO: 'boleto',
  CARTAO: 'cartao',
  APPLE_PAY: 'apple_pay',
  // Fora do PSP: lançados à mão no painel (provider 'manual').
  DINHEIRO: 'dinheiro',
  TRANSFERENCIA: 'transferencia',
});

const METODOS_VALIDOS = Object.freeze(Object.values(METODOS));

// ── Status canônico da cobrança ───────────────────────────────────────────
const STATUS = Object.freeze({
  CRIADA: 'criada',
  AGUARDANDO: 'aguardando_pagamento',
  PAGO_PARCIAL: 'pago_parcial',
  PAGO: 'pago',
  EXPIRADA: 'expirada',
  CANCELADA: 'cancelada',
  FALHOU: 'falhou',
  ESTORNADO_PARCIAL: 'estornado_parcial',
  ESTORNADO: 'estornado',
  CHARGEBACK: 'chargeback',
});

const STATUS_VALIDOS = Object.freeze(Object.values(STATUS));

// Estados em que a cobrança ainda pode mudar por ação do pagador/PSP — é o
// conjunto que o cron de reconciliação consulta no PSP.
const STATUS_ABERTOS = Object.freeze([
  STATUS.CRIADA,
  STATUS.AGUARDANDO,
  STATUS.PAGO_PARCIAL,
]);

// Estados terminais: nada os reabre. Reabrir = criar cobrança nova.
const STATUS_TERMINAIS = Object.freeze([
  STATUS.EXPIRADA,
  STATUS.CANCELADA,
  STATUS.FALHOU,
  STATUS.ESTORNADO,
  STATUS.CHARGEBACK,
]);

// Dinheiro entrou (total ou parcialmente). NÃO inclui estorno/chargeback: lá
// o dinheiro entrou e voltou, e quem trata isso é o handler `aoEstornar`.
const STATUS_COM_DINHEIRO = Object.freeze([
  STATUS.PAGO_PARCIAL,
  STATUS.PAGO,
]);

// ── Tipos de evento financeiro (razão auxiliar `pag_pagamentos`) ──────────
const TIPO_PAGAMENTO = Object.freeze({
  LIQUIDACAO: 'liquidacao',
  ESTORNO: 'estorno',
  CHARGEBACK: 'chargeback',
  TARIFA: 'tarifa',
});

// ── Origens conhecidas (`pag_cobrancas.origem_tipo`) ─────────────────────
// Texto livre no banco DE PROPÓSITO: módulo novo não exige migration. Este
// mapa é só documentação + autocomplete.
const ORIGENS = Object.freeze({
  RETIRO_INSCRICAO: 'retiro_inscricao',
  INSCRICAO: 'inscricao',      // módulo genérico de inscrições (Marcos Paulo)
  CURSO: 'curso',
  GENEROSIDADE: 'generosidade',
  MANUAL: 'manual',
});

/**
 * Transições permitidas. Espelha EXATAMENTE o trigger
 * `fn_pag_cobrancas_transicao` (migration 20260728120000) — se mudar aqui,
 * mudar lá; o banco é a autoridade final e o JS é a primeira barreira.
 *
 * Invariante central: **`pago` nunca regride**, só avança pra estorno ou
 * chargeback. Um webhook fora de ordem (reentrega do PSP chegando depois do
 * cron de expiração) não pode "despagar" uma inscrição já confirmada.
 */
const TRANSICOES = Object.freeze({
  [STATUS.CRIADA]: Object.freeze([
    STATUS.AGUARDANDO, STATUS.PAGO, STATUS.PAGO_PARCIAL,
    STATUS.CANCELADA, STATUS.EXPIRADA, STATUS.FALHOU,
  ]),
  [STATUS.AGUARDANDO]: Object.freeze([
    STATUS.PAGO, STATUS.PAGO_PARCIAL,
    STATUS.CANCELADA, STATUS.EXPIRADA, STATUS.FALHOU,
  ]),
  [STATUS.PAGO_PARCIAL]: Object.freeze([
    STATUS.PAGO, STATUS.CANCELADA, STATUS.EXPIRADA,
    STATUS.ESTORNADO, STATUS.ESTORNADO_PARCIAL, STATUS.CHARGEBACK,
  ]),
  [STATUS.PAGO]: Object.freeze([
    STATUS.ESTORNADO, STATUS.ESTORNADO_PARCIAL, STATUS.CHARGEBACK,
  ]),
  [STATUS.ESTORNADO_PARCIAL]: Object.freeze([
    STATUS.ESTORNADO, STATUS.CHARGEBACK,
  ]),
  // Absorventes (sem saída):
  [STATUS.EXPIRADA]: Object.freeze([]),
  [STATUS.CANCELADA]: Object.freeze([]),
  [STATUS.FALHOU]: Object.freeze([]),
  [STATUS.ESTORNADO]: Object.freeze([]),
  [STATUS.CHARGEBACK]: Object.freeze([]),
});

module.exports = {
  METODOS,
  METODOS_VALIDOS,
  STATUS,
  STATUS_VALIDOS,
  STATUS_ABERTOS,
  STATUS_TERMINAIS,
  STATUS_COM_DINHEIRO,
  TIPO_PAGAMENTO,
  ORIGENS,
  TRANSICOES,
};
