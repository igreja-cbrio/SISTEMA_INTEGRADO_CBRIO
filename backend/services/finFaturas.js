// Faturas de cartão de crédito · Fase 4 da reforma do Financeiro.
//
// Modelo: cada cartão tem dia_fechamento e dia_vencimento. Uma COMPRA entra na
// fatura cujo FECHAMENTO é o próximo dia-de-fechamento >= data da compra
// (compra depois do fechamento → fatura do mês seguinte, como o Matheus
// alertou). O vencimento é o próximo dia-de-vencimento DEPOIS do fechamento.
// A fatura vira 1 linha no Contas a Pagar (total corrente + vencimento) e o
// total é recalculado a cada item (sync), somando:
//   · log_compras com fatura_id      (compras da Logística/scan/WhatsApp/app)
//   · fin_transacoes com fatura_id   (despesas de cartão lançadas à mão)
// ⚠️ Não vincular a MESMA despesa nas duas fontes (duplicaria o total).

const { supabase } = require('../utils/supabase');

const DIA = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// último dia do mês (pra cartão que fecha dia 31 em mês de 30)
function diaNoMes(ano, mes0, dia) {
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes0, Math.min(dia, ultimo)));
}

// Ciclo da compra: fechamento (próximo dia_fechamento >= data) + vencimento
// (próximo dia_vencimento > fechamento).
function cicloDaCompra(cartao, dataCompraISO) {
  const d = new Date(`${String(dataCompraISO).slice(0, 10)}T00:00:00Z`);
  let fech = diaNoMes(d.getUTCFullYear(), d.getUTCMonth(), cartao.dia_fechamento);
  if (fech < d) fech = diaNoMes(d.getUTCFullYear(), d.getUTCMonth() + 1, cartao.dia_fechamento);
  let venc = diaNoMes(fech.getUTCFullYear(), fech.getUTCMonth(), cartao.dia_vencimento);
  if (venc <= fech) venc = diaNoMes(fech.getUTCFullYear(), fech.getUTCMonth() + 1, cartao.dia_vencimento);
  return { fechamento: iso(fech), vencimento: iso(venc) };
}

// Find-or-create da fatura do ciclo (UNIQUE cartao_id+vencimento segura corrida)
async function obterFatura(cartao, dataCompraISO) {
  const { fechamento, vencimento } = cicloDaCompra(cartao, dataCompraISO);
  const { data: existente } = await supabase.from('fin_faturas')
    .select('*').eq('cartao_id', cartao.id).eq('vencimento', vencimento).maybeSingle();
  if (existente) return existente;
  const { data: nova, error } = await supabase.from('fin_faturas')
    .insert({ cartao_id: cartao.id, fechamento, vencimento, status: 'aberta' })
    .select().single();
  if (error) {
    // corrida: outra requisição criou → re-busca
    const { data: retry } = await supabase.from('fin_faturas')
      .select('*').eq('cartao_id', cartao.id).eq('vencimento', vencimento).maybeSingle();
    if (retry) return retry;
    throw error;
  }
  return nova;
}

// Recalcula o total da fatura e sincroniza a linha no Contas a Pagar
async function sincronizarFatura(faturaId) {
  const { data: fatura } = await supabase.from('fin_faturas')
    .select('*, cartao:cartao_id(*)').eq('id', faturaId).maybeSingle();
  if (!fatura) return null;

  const [{ data: compras }, { data: trans }] = await Promise.all([
    supabase.from('log_compras').select('valor').eq('fatura_id', faturaId).is('deleted_at', null),
    supabase.from('fin_transacoes').select('valor').eq('fatura_id', faturaId),
  ]);
  const total = [...(compras || []), ...(trans || [])]
    .reduce((s, r) => s + Math.abs(Number(r.valor) || 0), 0);

  await supabase.from('fin_faturas')
    .update({ total, updated_at: new Date().toISOString() }).eq('id', faturaId);

  // Linha no Contas a Pagar (cria na 1ª vez · depois só atualiza o total)
  const mesVenc = String(fatura.vencimento).slice(0, 7).split('-').reverse().join('/');
  const descricao = `Fatura ${fatura.cartao?.nome || 'cartão'}${fatura.cartao?.final ? ` · final ${fatura.cartao.final}` : ''} · venc. ${mesVenc}`;
  if (fatura.contas_pagar_id) {
    await supabase.from('fin_contas_pagar')
      .update({ valor: total, data_vencimento: fatura.vencimento, descricao })
      .eq('id', fatura.contas_pagar_id).eq('status', 'pendente'); // paga não mexe
  } else if (total > 0) {
    const { data: conta } = await supabase.from('fin_contas_pagar')
      .insert({
        descricao,
        fornecedor: fatura.cartao?.nome || 'Cartão de crédito',
        valor: total,
        data_vencimento: fatura.vencimento,
        conta_id: fatura.cartao?.conta_id || null,
        status: 'pendente',
        forma_pagamento: 'Cartão de Crédito',
        pago_cartao: true,
        cartao_id: fatura.cartao_id,
        fatura_id: fatura.id,
        origem: 'fatura_cartao',
      })
      .select('id').single();
    if (conta) {
      await supabase.from('fin_faturas').update({ contas_pagar_id: conta.id }).eq('id', faturaId);
    }
  }
  return total;
}

// Vincula uma TRANSAÇÃO manual de cartão à fatura (chamado no POST/PUT /transacoes)
async function vincularTransacaoNaFatura(transacao, cartaoId) {
  try {
    const { data: cartao } = await supabase.from('fin_cartoes')
      .select('*').eq('id', cartaoId).eq('ativo', true).maybeSingle();
    if (!cartao) return null;
    const dataRef = transacao.data_competencia || transacao.data_pagamento;
    const fatura = await obterFatura(cartao, dataRef);
    await supabase.from('fin_transacoes')
      .update({ cartao_id: cartao.id, fatura_id: fatura.id }).eq('id', transacao.id);
    await sincronizarFatura(fatura.id);
    return fatura.id;
  } catch (e) { console.error('[FATURA] vincular transação:', e.message); return null; }
}

// Vincula uma COMPRA da Logística à fatura. Casa o cartão pelo texto da forma
// de pagamento ('Cartão Santander' → cartão cujo nome contém 'santander');
// com 1 só cartão ativo, qualquer 'cartão' casa nele. Best-effort.
async function vincularCompraNaFatura(compra) {
  try {
    if (!compra?.id) return null;
    const forma = norm(compra.forma_pgto);
    if (!forma.includes('cartao')) return null;
    const { data: cartoes } = await supabase.from('fin_cartoes').select('*').eq('ativo', true);
    if (!cartoes?.length) return null;

    let cartao = null;
    if (cartoes.length === 1) {
      cartao = cartoes[0];
    } else {
      const rotulo = forma.replace(/cartao/g, '').trim(); // 'santander', 'itau'...
      cartao = cartoes.find((c) => rotulo && norm(c.nome).includes(rotulo))
        || cartoes.find((c) => rotulo && rotulo.includes(norm(c.nome)));
      if (!cartao) return null; // ambíguo → não chuta
    }

    const fatura = await obterFatura(cartao, compra.data_compra || iso(new Date()));
    await supabase.from('log_compras')
      .update({ cartao_id: cartao.id, fatura_id: fatura.id }).eq('id', compra.id);
    await sincronizarFatura(fatura.id);
    return fatura.id;
  } catch (e) { console.error('[FATURA] vincular compra:', e.message); return null; }
}

// Fecha faturas cujo fechamento já passou (best-effort · chamado nos GETs)
async function fecharFaturasVencidas() {
  try {
    await supabase.from('fin_faturas')
      .update({ status: 'fechada', updated_at: new Date().toISOString() })
      .eq('status', 'aberta').lt('fechamento', iso(new Date()));
  } catch (e) { console.error('[FATURA] fechar vencidas:', e.message); }
}

// Itens da fatura (compras + transações manuais) + rubricas por plano de contas
async function itensDaFatura(faturaId) {
  const [{ data: compras }, { data: trans }] = await Promise.all([
    supabase.from('log_compras')
      .select('id, data_compra, fornecedor, materiais, valor, parcelas, plano_contas_id, plano:plano_contas_id(codigo, nome)')
      .eq('fatura_id', faturaId).is('deleted_at', null).order('data_compra'),
    supabase.from('fin_transacoes')
      .select('id, data_competencia, descricao, valor, parcelas_total, parcela_num, plano_contas_id, plano:plano_contas_id(codigo, nome)')
      .eq('fatura_id', faturaId).order('data_competencia'),
  ]);
  const itens = [
    ...(compras || []).map((c) => ({
      origem: 'compra', id: c.id, data: c.data_compra,
      descricao: c.fornecedor || c.materiais || 'Compra',
      detalhe: c.materiais || null,
      valor: Math.abs(Number(c.valor) || 0),
      parcelas: c.parcelas || null,
      plano: c.plano ? `${c.plano.codigo} ${c.plano.nome}` : null,
    })),
    ...(trans || []).map((t) => ({
      origem: 'transacao', id: t.id, data: t.data_competencia,
      descricao: t.descricao, detalhe: null,
      valor: Math.abs(Number(t.valor) || 0),
      parcelas: t.parcelas_total ? `${t.parcela_num || 1}/${t.parcelas_total}` : null,
      plano: t.plano ? `${t.plano.codigo} ${t.plano.nome}` : null,
    })),
  ].sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const rubricas = {};
  for (const i of itens) {
    const k = i.plano || 'Sem plano de contas';
    rubricas[k] = (rubricas[k] || 0) + i.valor;
  }
  return {
    itens,
    rubricas: Object.entries(rubricas).map(([plano, total]) => ({ plano, total }))
      .sort((a, b) => b.total - a.total),
  };
}

module.exports = {
  cicloDaCompra, obterFatura, sincronizarFatura,
  vincularTransacaoNaFatura, vincularCompraNaFatura,
  fecharFaturasVencidas, itensDaFatura,
};
