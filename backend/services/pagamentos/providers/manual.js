// Provider `manual` — dinheiro que NÃO passa por PSP.
//
// Cobre três casos reais:
//   1. Pessoa pagou em espécie / transferência direta e a secretaria lança.
//   2. "Marcar como pago" no painel (rede de segurança quando o webhook falha
//      e a conciliação humana confirma que o dinheiro entrou).
//   3. Plano B operacional: PIX na chave da igreja com conferência no extrato.
//
// Não fala com serviço externo nenhum, então nunca falha por rede — é
// justamente o que o torna a rede de segurança dos outros providers.
//
// ⚠️ Este provider não tem webhook. Quem confirma é humano, e a autoria fica
// em `pag_cobrancas.criado_por` / `pag_pagamentos.payload.confirmado_por`.

const { STATUS } = require('../tipos');

const nome = 'manual';

// O que este provider sabe fazer. A fachada consulta isto antes de oferecer
// método na tela — evitar "escolhi cartão e deu erro depois" é mais barato que
// tratar o erro.
const capacidades = Object.freeze({
  metodos: ['dinheiro', 'transferencia', 'pix'],
  parcelas_max: 1,
  webhook: false,
  estorno: false,      // estorno de dinheiro em espécie é ato de tesouraria
  consulta_status: false,
});

/**
 * "Criar cobrança" aqui é só registrar a intenção — não existe checkout.
 * A cobrança nasce AGUARDANDO e alguém confirma depois.
 */
async function criarCobranca(dados) {
  return {
    provider_cobranca_id: null,
    status: STATUS.AGUARDANDO,
    checkout_url: null,
    pix_payload: null,
    pix_qrcode_base64: null,
    boleto_linha_digitavel: null,
    boleto_url: null,
    metodo: dados.metodo || null,
    bruto: { manual: true },
  };
}

// Sem PSP não há o que consultar: a verdade é o que o humano registrou.
async function consultarStatus() {
  return null;
}

async function cancelarCobranca() {
  return { ok: true };
}

async function estornar() {
  throw new Error('Provider manual não estorna — devolução em espécie é ato de tesouraria, registre à mão.');
}

// Sem webhook. Se algo chamar isto, é bug de roteamento — falhar alto.
function verificarAssinatura() {
  return { ok: false, motivo: 'provider manual não recebe webhook' };
}

function normalizarEvento() {
  return null;
}

module.exports = {
  nome,
  capacidades,
  criarCobranca,
  consultarStatus,
  cancelarCobranca,
  estornar,
  verificarAssinatura,
  normalizarEvento,
};
