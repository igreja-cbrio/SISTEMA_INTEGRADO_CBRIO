// Peças compartilhadas pelas PÁGINAS PÚBLICAS de pagamento.
//
// Existem duas hoje (inscrição paga e doação/Generosidade) e as duas fazem as
// MESMAS duas coisas: dizer à tela em que estado o pagamento está, e aplicar a
// forma que a pessoa escolheu. Este arquivo é a régua única disso.
//
// ⚠️ Por que extrair em vez de copiar: a escolha de forma é onde vivem as leis
// que custaram dinheiro pra descobrir — o teto de parcelas validado no servidor,
// o `installmentCount` que NUNCA vai na criação da cobrança (senão o PSP cria N
// cobranças e a primeira parcela "quita" a inscrição inteira), e a guarda de que
// a forma gravada é a que o provedor DEVOLVEU, não a que foi pedida. Uma segunda
// cópia dessa lógica seria a garantia de que uma das duas telas ia divergir.
//
// ⚠️ NÃO acrescentar aqui nada específico de um domínio (código da inscrição,
// comprovante de check-in, categoria da doação). O específico monta em cima:
//   { ...estadoBasePagamento(c), ...extrasDoMeuDominio }
// Este módulo não sabe o que está sendo pago.

const pagamentos = require('./index');

/**
 * O que TODA tela pública de pagamento precisa saber, e nada além.
 *
 * ⚠️ Resposta pública (o `public_token` é o único segredo): nada de PII do
 * pagador, nada de `metadata`, nada de payload do PSP.
 */
function estadoBasePagamento(cobranca) {
  const ofertados = Array.isArray(cobranca.metodos_ofertados) ? cobranca.metodos_ofertados : [];
  return {
    status: cobranca.status,
    pago: cobranca.status === 'pago',
    valor_centavos: cobranca.valor_centavos,
    valor_pago_centavos: cobranca.valor_pago_centavos,
    metodo: cobranca.metodo || null,
    parcelas: cobranca.parcelas_total || null,
    // Quais formas a tela deve oferecer (config cruzada com a capacidade do
    // provider — não é PII). Sem isto a página teria que chutar as três.
    metodos: ofertados,
    parcelas_max: cobranca.parcelas_max || null,
    checkout_url: cobranca.checkout_url || null,
    pix_payload: cobranca.pix_payload || null,
    boleto_linha_digitavel: cobranca.boleto_linha_digitavel || null,
    boleto_url: cobranca.boleto_url || null,
    expira_em: cobranca.expira_em || null,
    pago_em: cobranca.pago_em || null,
    // ── Cartão NA PRÓPRIA PÁGINA ──
    // Quando o provider sabe tokenizar no navegador, a tela mostra formulário
    // próprio em vez de mandar a pessoa pro site dele. `null` = cai no checkout
    // hospedado (comportamento antigo), então isto degrada sozinho.
    // ⚠️ Só faz sentido enquanto NÃO está pago e se cartão está entre as formas
    // ofertadas — mandar a chave em toda resposta seria ruído.
    cartao_na_pagina: !!(
      cobranca.status !== 'pago'
      && ofertados.includes('cartao')
      && pagamentos.capacidades(cobranca.provider)?.tokenizacao
      && pagamentos.chavePublica(cobranca.provider)
    ),
    cartao_public_key: (
      cobranca.status !== 'pago'
      && ofertados.includes('cartao')
      && pagamentos.capacidades(cobranca.provider)?.tokenizacao
    ) ? pagamentos.chavePublica(cobranca.provider) : null,
  };
}

/**
 * Teto de parcelas EFETIVO desta cobrança.
 *
 * ⚠️⚠️ SEM TETO GRAVADO = **À VISTA (1x)**, nunca o teto da conta do PSP
 * (mudado em 11/08/2026 · pedido do Matheus de definir o parcelamento pelo
 * sistema). A regra anterior era o oposto e mentia na direção CARA:
 *
 *   · a tela do evento dizia, com todas as letras, *"vazio = sem parcelar"*;
 *   · o servidor, com o campo vazio, liberava **o teto do provedor** — 36x no
 *     Mercado Pago, 21x no Asaas;
 *   · e o custo do parcelado é da IGREJA enquanto não estiver confirmado que o
 *     Mercado Pago repassa juros ao pagador (4–13% conforme as parcelas).
 *
 * Ou seja: quem criasse um evento pago e não preenchesse o campo — que é o
 * default do formulário — abria 36x sem saber. Agora **quem decide política de
 * preço é a igreja, no evento**; provedor define capacidade, não política.
 *
 * ⚠️ Isto NÃO tira parcelamento de ninguém que o tenha configurado: teto
 * gravado continua mandando. E a generosidade não é afetada — ela grava
 * `parcelas_max` explícito na cobrança (`publicGenerosidade.js`), então nunca
 * dependeu deste fallback.
 */
function tetoParcelas(cobranca) {
  if (Number(cobranca.parcelas_max) > 0) return Number(cobranca.parcelas_max);
  return 1;
}

/**
 * Aplica a forma escolhida pela pessoa.
 *
 * ⚠️ Isto NÃO é preferência de interface: é o que faz o meio de pagamento
 * EXISTIR do lado do provedor. Cobrança criada sem forma definida rende uma
 * fatura com o que a CONTA do provedor tem habilitado (o 1º teste em sandbox
 * rendeu "só boleto" enquanto a nossa tela oferecia Pix e cartão). Aqui a
 * escolha vira fato lá, e o erro (conta sem chave Pix, cartão não liberado)
 * aparece na hora em vez de virar uma fatura errada.
 *
 * Não mexe em valor, status nem vaga: trocar de forma não é pagar nem cancelar.
 *
 * Devolve SEMPRE `{ cobranca, status, error? }` — nunca lança. `status` é o HTTP
 * que a rota deve responder, e `cobranca` é o estado ATUAL mesmo em erro, pra a
 * tela não regredir pra vazio.
 */
/**
 * A DECISÃO, sem efeito colateral: o que fazer com o pedido da tela.
 *
 * Separada de propósito — é régua PURA, entra no gate de deploy sem banco, sem
 * rede e sem mock (o padrão do `censoConvite`/`prontidaoCadastro`). Devolve
 * `{ acao: 'recusar' | 'ja_pago' | 'aplicar' }`.
 *
 * `tetoEfetivo` entra como NÚMERO já resolvido (`tetoParcelas`), não como
 * consulta: assim a régua não sabe o que é um provider.
 */
function decidirForma(cobranca, { metodo: metodoBruto, parcelas: parcelasBrutas } = {}, tetoEfetivo = 1) {
  const metodo = String(metodoBruto || '').trim();
  const ofertados = Array.isArray(cobranca.metodos_ofertados) ? cobranca.metodos_ofertados : [];

  // Respeita a configuração de quem criou a cobrança: forma fora da lista não é
  // oferecida nem por chamada direta. Lista vazia = cobrança antiga, antes do
  // seletor de formas.
  if (ofertados.length && !ofertados.includes(metodo)) {
    return { acao: 'recusar', status: 400, error: 'Esta forma de pagamento não está disponível.' };
  }
  // Já pago não é erro — é a resposta certa (a pessoa pode ter dois cliques).
  if (cobranca.status === 'pago') return { acao: 'ja_pago', status: 200 };

  // Parcelas: teto validado NO SERVIDOR. Confiar no número que vem da tela
  // deixaria alguém parcelar em 21x algo configurado para 3x.
  // ⚠️ Só CARTÃO parcela: mandar plano numa forma que não parcela é como o
  // adapter acaba criando N cobranças e a primeira "quita" a cobrança inteira.
  // ⚠️ O teto vem PRONTO do `tetoParcelas` (parâmetro), e a régua não o
  // recalcula: recalcular aqui era uma 2ª cópia da mesma decisão, e foi assim
  // que "sem teto" significou 1x num lugar e 36x no outro.
  const pedidas = Math.floor(Number(parcelasBrutas) || 1);
  const teto = Number(tetoEfetivo) > 0 ? Number(tetoEfetivo) : 1;
  const parcelas = metodo === 'cartao' && pedidas > 1 ? Math.min(pedidas, teto) : 1;

  return { acao: 'aplicar', metodo, parcelas };
}

/**
 * @param deps injeção usada pelo TESTE do gate (`definirMetodo`). Em produção
 *   ninguém passa: o padrão é a fachada. Existe porque o núcleo é CommonJS e
 *   espionar `module.exports` sob o Vitest patcha o wrapper de interop, não a
 *   função que roda — teste que não prova nada é pior que teste nenhum.
 */
async function escolherFormaPagamento(cobranca, pedido = {}, deps = {}) {
  const definirMetodo = deps.definirMetodo || pagamentos.definirMetodo;
  const d = decidirForma(cobranca, pedido, tetoParcelas(cobranca));
  if (d.acao === 'recusar') return { cobranca, status: d.status, error: d.error };
  if (d.acao === 'ja_pago') return { cobranca, status: 200 };
  const { metodo, parcelas } = d;

  try {
    const r = await definirMetodo(cobranca, metodo, { parcelas });
    // `alterada: false` = a cobrança não aceita mais troca de forma (já tem
    // dinheiro dentro ou está terminal). Responder 200 aqui seria silencioso: a
    // aba mudaria, o servidor não, e a tela mostraria duas verdades.
    if (r.alterada === false) {
      return {
        cobranca: r.cobranca,
        status: 409,
        error: 'Esta cobrança não aceita mais troca de forma de pagamento.',
      };
    }
    return { cobranca: r.cobranca, status: 200 };
  } catch (e) {
    console.error('[pagamentos/telaPublica] definir forma:', e.message);
    // 502: o problema é do outro lado (conta do provedor sem aquele meio
    // habilitado, por exemplo). A tela mostra a alternativa que existe.
    return {
      cobranca,
      status: 502,
      error: 'Não conseguimos preparar esta forma de pagamento agora.',
    };
  }
}

/**
 * Rede de segurança nº 1 das páginas públicas: cobrança parada há mais de 2 min
 * sem resolver → consulta o PSP na hora.
 *
 * O webhook é otimização de latência; ninguém deve ficar olhando "aguardando"
 * porque uma entrega se perdeu. Devolve a cobrança (atualizada ou a original —
 * falha aqui nunca derruba a tela).
 */
const PARADA_MS = 120000;

async function sincronizarSeParada(cobranca, deps = {}) {
  const sincronizar = deps.sincronizar || pagamentos.sincronizar;
  const abertos = ['criada', 'aguardando_pagamento'];
  if (!abertos.includes(cobranca.status)) return cobranca;
  const paradaHa = Date.now() - new Date(cobranca.updated_at).getTime();
  if (!(paradaHa > PARADA_MS)) return cobranca;
  try {
    const r = await sincronizar(cobranca);
    return r?.cobranca || cobranca;
  } catch (e) {
    console.error('[pagamentos/telaPublica] sincronizar:', e.message);
    return cobranca;
  }
}

module.exports = {
  estadoBasePagamento,
  decidirForma,
  escolherFormaPagamento,
  sincronizarSeParada,
  tetoParcelas,
  PARADA_MS,
};
