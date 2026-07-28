// FACHADA do núcleo de pagamentos. É isto que os módulos de domínio importam:
//
//   const pagamentos = require('../services/pagamentos');
//
// ⚠️ Nenhum módulo de domínio importa `providers/*` nem `cobrancas.js` direto.
// Passar por aqui é o que faz trocar de PSP custar 1 arquivo + 1 env em vez de
// uma varredura no repositório.
//
// Kill switch: `PAG_ENABLED=0` recusa cobrança nova (o resto — consultar,
// expirar, reconciliar — continua funcionando, senão dinheiro já cobrado ficaria
// preso). Serve pra desligar venda sem deploy.

const providers = require('./providers');
const cobrancas = require('./cobrancas');
const webhooks = require('./webhooks');
const handlers = require('./handlers');
const tipos = require('./tipos');
const maquina = require('./maquinaEstados');

const { STATUS, TIPO_PAGAMENTO } = tipos;

function habilitado() {
  return process.env.PAG_ENABLED !== '0' && process.env.PAG_ENABLED !== 'false';
}

/**
 * Capacidades do provider — consultar ANTES de oferecer método na tela.
 * "Escolhi cartão e deu erro no fim" custa mais caro que não oferecer.
 */
function capacidades(providerNome) {
  return providers.obter(providerNome).capacidades;
}

/** Métodos que o provider sabe cobrar ∩ métodos que o evento quer oferecer. */
function metodosDisponiveis(desejados, providerNome) {
  const cap = capacidades(providerNome);
  const lista = Array.isArray(desejados) && desejados.length ? desejados : cap.metodos;
  return lista.filter((m) => cap.metodos.includes(m));
}

async function criarCobranca(dados) {
  if (!habilitado()) {
    throw new Error('Pagamentos estão desligados (PAG_ENABLED=0).');
  }
  return cobrancas.criarCobranca(dados);
}

const consultar = cobrancas.porId;
const consultarPorToken = cobrancas.porToken;
const consultarPorReferencia = cobrancas.porReferencia;

/**
 * Consulta o PSP e sincroniza. **É a verdade** — o webhook é só otimização de
 * latência. Chamado pelo cron de reconciliação e pela tela pós-checkout quando
 * a cobrança está pendente há mais de 2 min.
 */
async function sincronizar(cobrancaOuId) {
  const c = typeof cobrancaOuId === 'string' ? await cobrancas.porId(cobrancaOuId) : cobrancaOuId;
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (maquina.estaTerminal(c.status) || c.status === STATUS.PAGO) {
    return { ok: true, cobranca: c, semMudanca: true };
  }

  const adapter = providers.obter(c.provider);
  if (!adapter.capacidades.consulta_status) {
    return { ok: true, cobranca: c, semMudanca: true, motivo: 'provider não consulta status' };
  }

  const remoto = await adapter.consultarStatus(c);
  if (!remoto) return { ok: true, cobranca: c, semMudanca: true };

  if (Number(remoto.valor_pago_centavos || 0) > 0) {
    const r = await cobrancas.registrarPagamento(c, {
      tipo: TIPO_PAGAMENTO.LIQUIDACAO,
      valor_centavos: remoto.valor_pago_centavos,
      liquido_centavos: remoto.liquido_centavos,
      taxa_centavos: remoto.taxa_centavos,
      metodo: remoto.metodo, parcelas: remoto.parcelas,
      provider_pagamento_id: remoto.provider_pagamento_id,
      e2e_id: remoto.e2e_id, repassado_em: remoto.repassado_em,
      payload: remoto.bruto || null,
      // Mesma regra do webhook: sem isto o cron de reconciliação discordaria
      // dele no parcelado (soma não fecha → pago_parcial).
      statusFinal: remoto.quita_cobranca ? STATUS.PAGO : undefined,
    });
    return { ok: true, cobranca: r.cobranca, duplicado: r.duplicado };
  }

  if (remoto.status && remoto.status !== c.status) {
    const r = await cobrancas.aplicarStatus(c, remoto.status);
    return { ok: true, cobranca: r.cobranca, aplicado: r.aplicado, motivo: r.motivo };
  }
  return { ok: true, cobranca: c, semMudanca: true };
}

/**
 * Lançamento MANUAL de pagamento (rede de segurança nº 3: o webhook falhou, a
 * conciliação humana confirmou que o dinheiro entrou).
 *
 * `confirmado_por` é obrigatório: dinheiro entrando por decisão humana sem
 * autoria registrada é o que torna uma trilha de auditoria inútil.
 */
async function marcarPagoManual(cobrancaId, {
  confirmado_por, valor_centavos, metodo, observacao, repassado_em,
} = {}) {
  if (!confirmado_por) throw new Error('confirmado_por é obrigatório em pagamento manual');
  const c = await cobrancas.porId(cobrancaId);
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (c.status === STATUS.PAGO) return { ok: true, cobranca: c, semMudanca: true };
  if (maquina.estaTerminal(c.status)) {
    return { ok: false, motivo: `cobrança está ${c.status} — crie uma cobrança nova` };
  }

  const valor = Number(valor_centavos) > 0
    ? Number(valor_centavos)
    : (c.valor_centavos - c.valor_pago_centavos);

  const r = await cobrancas.registrarPagamento(c, {
    tipo: TIPO_PAGAMENTO.LIQUIDACAO,
    valor_centavos: valor,
    // Sem taxa: dinheiro fora do PSP não tem tarifa de gateway. Deixar null é
    // diferente de gravar 0 — null diz "não se aplica".
    metodo: metodo || 'dinheiro',
    payload: { manual: true, confirmado_por, observacao: observacao || null },
    repassado_em: repassado_em || null,
  });
  return { ok: true, cobranca: r.cobranca, duplicado: r.duplicado };
}

async function cancelar(cobrancaId, { motivo } = {}) {
  const c = await cobrancas.porId(cobrancaId);
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (maquina.temDinheiro(c.status)) {
    // Cancelar cobrança com dinheiro dentro seria esconder o valor recebido.
    return { ok: false, motivo: 'cobrança já tem pagamento — o caminho é estorno, não cancelamento' };
  }
  const adapter = providers.obter(c.provider);
  try {
    await adapter.cancelarCobranca(c);
  } catch (e) {
    console.error('[pagamentos] cancelar no provider falhou:', e.message);
    // Segue e cancela do nosso lado: cobrança que o PSP mantém aberta e a gente
    // fechou é conciliável; o inverso (a gente aberta, PSP fechada) não é.
  }
  const r = await cobrancas.aplicarStatus(c, STATUS.CANCELADA, {
    ultimo_erro: motivo ? String(motivo).slice(0, 500) : null,
  });
  return { ok: r.aplicado, cobranca: r.cobranca, motivo: r.motivo };
}

async function estornar(cobrancaId, { valor_centavos, motivo, solicitado_por } = {}) {
  const c = await cobrancas.porId(cobrancaId);
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (!maquina.temDinheiro(c.status)) {
    return { ok: false, motivo: `cobrança está ${c.status} — não há o que estornar` };
  }
  const adapter = providers.obter(c.provider);
  const parcial = Number(valor_centavos) > 0 && Number(valor_centavos) < c.valor_pago_centavos;
  const resp = await adapter.estornar(c, { valor_centavos: valor_centavos || c.valor_pago_centavos });

  const r = await cobrancas.registrarPagamento(c, {
    tipo: TIPO_PAGAMENTO.ESTORNO,
    valor_centavos: valor_centavos || c.valor_pago_centavos,
    provider_pagamento_id: resp?.provider_pagamento_id || null,
    payload: { motivo: motivo || null, solicitado_por: solicitado_por || null, ...(resp?.bruto || {}) },
  });
  const alvo = parcial ? STATUS.ESTORNADO_PARCIAL : STATUS.ESTORNADO;
  const f = await cobrancas.aplicarStatus(r.cobranca, alvo, {
    ultimo_erro: motivo ? String(motivo).slice(0, 500) : null,
  });
  return { ok: f.aplicado, cobranca: f.cobranca, motivo: f.motivo };
}

/**
 * Cron de expiração. Expira a cobrança E chama o domínio (que libera a vaga).
 * Nunca toca em quem já pagou algo — `listarParaExpirar` já filtra por
 * `podeExpirar`, e isso é invariante, não otimização.
 */
async function expirarVencidas({ limite = 200 } = {}) {
  const lista = await cobrancas.listarParaExpirar(limite);
  const r = { total: lista.length, expiradas: 0, ignoradas: 0 };
  for (const c of lista) {
    try {
      const res = await cobrancas.aplicarStatus(c, STATUS.EXPIRADA);
      if (res.aplicado) r.expiradas += 1; else r.ignoradas += 1;
    } catch (e) {
      r.ignoradas += 1;
      console.error(`[pagamentos] expirar ${c.id}:`, e.message);
    }
  }
  return r;
}

/**
 * Cron de reconciliação. O webhook é latência; ISTO é a verdade.
 *
 * Toca a linha ao fim de CADA tentativa (mesmo sem novidade e mesmo em falha):
 * é o que faz `listarParaReconciliar` — que ordena por `updated_at` — rotacionar
 * a fila inteira em vez de re-checar sempre as mesmas mais antigas.
 */
async function reconciliar({ dias = 30, limite = 200 } = {}) {
  const lista = await cobrancas.listarParaReconciliar({ dias, limite });
  const r = { total: lista.length, atualizadas: 0, iguais: 0, falhas: 0 };
  for (const c of lista) {
    try {
      const res = await sincronizar(c);
      if (res.semMudanca) {
        r.iguais += 1;
        await cobrancas.tocarReconciliacao(c.id);
      } else {
        r.atualizadas += 1;   // sincronizar já escreveu, updated_at subiu
      }
    } catch (e) {
      r.falhas += 1;
      console.error(`[pagamentos] reconciliar ${c.id}:`, e.message);
      // Toca mesmo em falha: senão uma cobrança que sempre erra (id inválido no
      // PSP, por exemplo) prende a vez e as outras nunca são conferidas.
      await cobrancas.tocarReconciliacao(c.id);
    }
  }
  return r;
}

module.exports = {
  // estado do módulo
  habilitado,
  capacidades,
  metodosDisponiveis,
  providerPadrao: providers.providerPadrao,
  pspConfigurado: providers.pspConfigurado,
  listarProviders: providers.listar,

  // ciclo de vida da cobrança
  criarCobranca,
  consultar,
  consultarPorToken,
  consultarPorReferencia,
  sincronizar,
  marcarPagoManual,
  cancelar,
  estornar,

  // crons
  expirarVencidas,
  reconciliar,

  // webhook (usado só pela rota /api/pagamentos-webhook)
  processarWebhook: webhooks.processar,
  reprocessarWebhooksPendentes: webhooks.reprocessarPendentes,

  // registro de handler de domínio (módulo novo chama isto no boot)
  registrarHandler: handlers.registrar,

  // vocabulário
  ...tipos,
};
