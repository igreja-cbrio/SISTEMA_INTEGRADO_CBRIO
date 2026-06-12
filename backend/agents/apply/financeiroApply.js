// Handlers que APLICAM (executam) ações propostas pelo agente executor
// financeiro depois que o humano aprovou via /api/agents/queue/:id/apply.
//
// Cada handler recebe { payload, reviewedBy } e devolve { ok, error?, info? }.
// Se ok=false, o caller marca a linha em agent_queue como status='failed'
// com apply_error preenchido.
//
// Regras:
//   1. Idempotente · se já foi aplicado por humano (status mudou), retorna
//      ok com info.skipped=true em vez de erro.
//   2. Respeita closing mensal · trigger SQL já bloqueia, mas damos
//      mensagem clara se acontecer.
//   3. Usa supabase service_role (bypass RLS) · vem de utils/supabase.

const { supabase } = require('../../utils/supabase');

// ─────────────────────────────────────────────────────────────────────
// fin.categorize_transaction
// Espelha POST /classificar/:filaId/aprovar de financeiroV2.js
// ─────────────────────────────────────────────────────────────────────
async function applyCategorizeTransaction({ payload, reviewedBy }) {
  const { fila_id, plano_contas_id, centro_custo_id, identificador_centavo } = payload || {};
  if (!fila_id) return { ok: false, error: 'fila_id ausente no payload' };
  if (!plano_contas_id) return { ok: false, error: 'plano_contas_id obrigatorio' };

  // Busca fila + lancamento bruto
  const { data: fila, error: errFila } = await supabase
    .from('fin_fila_classificacao')
    .select('*, lancamento:lancamento_bruto_id(*)')
    .eq('id', fila_id)
    .maybeSingle();
  if (errFila) return { ok: false, error: `Erro lendo fila: ${errFila.message}` };
  if (!fila) return { ok: false, error: 'Item de fila não encontrado' };
  if (fila.status !== 'pendente') {
    return { ok: true, info: { skipped: true, motivo: `fila já com status=${fila.status}` } };
  }
  const lanc = fila.lancamento;
  if (!lanc) return { ok: false, error: 'Lancamento bruto não encontrado' };

  // Determina tipo (receita/despesa) baseado no plano
  const { data: pc } = await supabase
    .from('fin_plano_contas')
    .select('tipo')
    .eq('id', plano_contas_id)
    .maybeSingle();
  const tipoTransacao = pc?.tipo === 'receita'
    ? 'receita'
    : pc?.tipo === 'despesa'
      ? 'despesa'
      : (lanc.tipo_trn === 'CREDIT' ? 'receita' : 'despesa');

  // Identifica culto se for credito com hora
  let culto_slot_id = null;
  if (lanc.hora_lancamento && tipoTransacao === 'receita') {
    const dt = `${lanc.data_lancamento}T${lanc.hora_lancamento}`;
    const { data: cultoId } = await supabase.rpc('fin_identifica_culto', { p_datetime: dt });
    culto_slot_id = cultoId || null;
  }

  // pix_detalhe linkado pra histórico do pagador
  let pixDetalheId = null;
  if (tipoTransacao === 'receita') {
    const { data: pd } = await supabase
      .from('fin_pix_detalhe')
      .select('id')
      .eq('lancamento_bruto_id', lanc.id)
      .maybeSingle();
    pixDetalheId = pd?.id || null;
  }

  // Insere fin_transacoes (gatilho de closing bloqueia se mês fechado)
  const { data: transacao, error: errTrans } = await supabase
    .from('fin_transacoes')
    .insert({
      conta_id: lanc.conta_id,
      tipo: tipoTransacao,
      descricao: lanc.memo || 'Sem descrição',
      valor: Math.abs(lanc.valor),
      data_competencia: lanc.data_lancamento,
      data_pagamento: lanc.data_lancamento,
      status: 'conciliado',
      referencia: lanc.fitid || lanc.end_to_end_id,
      plano_contas_id,
      centro_custo_id: centro_custo_id || null,
      lancamento_bruto_id: lanc.id,
      pix_detalhe_id: pixDetalheId,
      culto_slot_id,
      hora_real: lanc.hora_lancamento,
      classificacao_origem: 'agente_executor',
      classificacao_confianca: fila.sugestao_confianca || 0.9,
      identificador_centavo: identificador_centavo || null,
      created_by: reviewedBy || null,
    })
    .select('id')
    .single();
  if (errTrans) return { ok: false, error: errTrans.message };

  await supabase
    .from('fin_lancamentos_brutos')
    .update({ ja_classificado: true })
    .eq('id', lanc.id);

  await supabase
    .from('fin_fila_classificacao')
    .update({
      status: 'aprovado',
      decidido_em: new Date().toISOString(),
      decidido_por: reviewedBy || null,
    })
    .eq('id', fila_id);

  return { ok: true, info: { transacao_id: transacao.id } };
}

// ─────────────────────────────────────────────────────────────────────
// fin.mark_payable_paid
// ─────────────────────────────────────────────────────────────────────
async function applyMarkPayablePaid({ payload, reviewedBy }) {
  const { conta_pagar_id, data_pagamento, transacao_id, conta_id } = payload || {};
  if (!conta_pagar_id) return { ok: false, error: 'conta_pagar_id ausente' };
  if (!data_pagamento) return { ok: false, error: 'data_pagamento obrigatorio (YYYY-MM-DD)' };

  const { data: conta, error: errConta } = await supabase
    .from('fin_contas_pagar')
    .select('id, status, valor, descricao')
    .eq('id', conta_pagar_id)
    .maybeSingle();
  if (errConta) return { ok: false, error: errConta.message };
  if (!conta) return { ok: false, error: 'Conta a pagar não encontrada' };
  if (conta.status !== 'pendente') {
    return { ok: true, info: { skipped: true, motivo: `conta já com status=${conta.status}` } };
  }

  const update = {
    status: 'pago',
    data_pagamento,
  };
  if (transacao_id) update.transacao_id = transacao_id;
  if (conta_id) update.conta_id = conta_id;

  const { error } = await supabase
    .from('fin_contas_pagar')
    .update(update)
    .eq('id', conta_pagar_id);
  if (error) return { ok: false, error: error.message };

  return { ok: true, info: { conta_pagar_id, marcada_paga_em: data_pagamento } };
}

// ─────────────────────────────────────────────────────────────────────
// fin.reimbursement_decision
// ─────────────────────────────────────────────────────────────────────
async function applyReimbursementDecision({ payload, reviewedBy }) {
  const { reembolso_id, decisao } = payload || {};
  if (!reembolso_id) return { ok: false, error: 'reembolso_id ausente' };
  if (!['aprovar', 'rejeitar'].includes(decisao)) {
    return { ok: false, error: "decisão deve ser 'aprovar' ou 'rejeitar'" };
  }

  const { data: r, error: errR } = await supabase
    .from('fin_reembolsos')
    .select('id, status')
    .eq('id', reembolso_id)
    .maybeSingle();
  if (errR) return { ok: false, error: errR.message };
  if (!r) return { ok: false, error: 'Reembolso não encontrado' };
  if (r.status !== 'pendente') {
    return { ok: true, info: { skipped: true, motivo: `reembolso já com status=${r.status}` } };
  }

  const novoStatus = decisao === 'aprovar' ? 'aprovado' : 'rejeitado';
  const { error } = await supabase
    .from('fin_reembolsos')
    .update({
      status: novoStatus,
      decidido_em: new Date().toISOString(),
      decidido_por: reviewedBy || null,
    })
    .eq('id', reembolso_id);
  // Algumas instancias podem não ter decidido_em/decidido_por · cair pra update mínimo
  if (error && /column .* does not exist/i.test(error.message)) {
    const fallback = await supabase
      .from('fin_reembolsos')
      .update({ status: novoStatus })
      .eq('id', reembolso_id);
    if (fallback.error) return { ok: false, error: fallback.error.message };
  } else if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, info: { reembolso_id, novo_status: novoStatus } };
}

// ─────────────────────────────────────────────────────────────────────
// fin.atender_alerta
// ─────────────────────────────────────────────────────────────────────
async function applyAtenderAlerta({ payload, reviewedBy }) {
  const { alerta_id } = payload || {};
  if (!alerta_id) return { ok: false, error: 'alerta_id ausente' };

  const { data: a, error: errA } = await supabase
    .from('fin_alertas')
    .select('id, atendido_em')
    .eq('id', alerta_id)
    .maybeSingle();
  if (errA) return { ok: false, error: errA.message };
  if (!a) return { ok: false, error: 'Alerta não encontrado' };
  if (a.atendido_em) {
    return { ok: true, info: { skipped: true, motivo: 'alerta já atendido' } };
  }

  const update = {
    atendido_em: new Date().toISOString(),
  };
  // alguns schemas tem atendido_por
  if (reviewedBy) update.atendido_por = reviewedBy;

  let { error } = await supabase
    .from('fin_alertas')
    .update(update)
    .eq('id', alerta_id);
  if (error && /column .* does not exist/i.test(error.message)) {
    const fallback = await supabase
      .from('fin_alertas')
      .update({ atendido_em: update.atendido_em })
      .eq('id', alerta_id);
    if (fallback.error) return { ok: false, error: fallback.error.message };
  } else if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, info: { alerta_id, atendido_em: update.atendido_em } };
}

// Roteador central
const HANDLERS = {
  'fin.categorize_transaction': applyCategorizeTransaction,
  'fin.mark_payable_paid':      applyMarkPayablePaid,
  'fin.reimbursement_decision': applyReimbursementDecision,
  'fin.atender_alerta':         applyAtenderAlerta,
};

/**
 * Aplica uma ação da fila. NÃO faz UPDATE em agent_queue (o caller controla).
 * Retorna sempre { ok, error?, info? } · nunca lanca.
 */
async function applyQueueAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try {
    return await handler({ payload, reviewedBy });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { applyQueueAction, HANDLERS };
