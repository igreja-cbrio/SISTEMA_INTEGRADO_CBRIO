// Sugere a SAÍDA do balanço (fin_transacoes despesa) que casa com uma compra.
//
// Cruzamento fiscal: quem lança o financeiro precisa achar, pra cada compra do
// Pery, a despesa correspondente que já entrou pela importação do balanço.
// Heurística: mesma faixa de valor + janela de data + similaridade de texto
// (fornecedor/materiais × descrição da transação). NUNCA vincula sozinho —
// devolve candidatos ranqueados pra confirmação manual.

const { supabase } = require('../utils/supabase');

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

function simTexto(a, b) {
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  if (!ta.size || !tb.length) return 0;
  const inter = tb.filter((t) => ta.has(t)).length;
  return inter / Math.max(ta.size, tb.length);
}

function addDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Devolve candidatos de saída do balanço pra uma compra.
 * @param {{valor:number, data_compra:string, fornecedor:string, materiais:string, id:string}} compra
 * @param {{janelaAntes?:number, janelaDepois?:number, tolerancia?:number, limite?:number}} opts
 */
async function sugerirSaidas(compra, opts = {}) {
  const valor = Math.abs(Number(compra.valor) || 0);
  if (!valor) return [];
  const tol = opts.tolerancia ?? 0.02;                  // ±2% no valor
  const antes = opts.janelaAntes ?? 7;
  const depois = opts.janelaDepois ?? 45;
  const limite = opts.limite ?? 8;

  let q = supabase.from('fin_transacoes')
    .select('id, valor, descricao, data_competencia, plano_contas_id, centro_custo_id, status, forma_pagamento')
    .eq('tipo', 'despesa')
    .neq('status', 'cancelado')                          // não sugerir saída cancelada
    .gte('valor', valor * (1 - tol))
    .lte('valor', valor * (1 + tol));

  if (compra.data_compra) {
    q = q.gte('data_competencia', addDias(compra.data_compra, -antes))
         .lte('data_competencia', addDias(compra.data_compra, depois));
  }
  const { data: cands, error } = await q.limit(60);
  if (error) { console.error('[COMPRAS-MATCH]', error.message); return []; }
  if (!cands?.length) return [];

  // saídas já vinculadas a outras compras (não sugerir de novo)
  const ids = cands.map((c) => c.id);
  const { data: jaUsadas } = await supabase.from('log_compras')
    .select('fin_transacao_id, id')
    .in('fin_transacao_id', ids)
    .is('deleted_at', null);
  const usadasPorOutra = new Set(
    (jaUsadas || []).filter((u) => u.id !== compra.id).map((u) => u.fin_transacao_id),
  );

  const alvoTexto = [compra.fornecedor, compra.materiais].filter(Boolean).join(' ');
  const ranked = cands.map((t) => {
    const difValor = Math.abs(Math.abs(Number(t.valor)) - valor);
    const scoreValor = difValor < 0.01 ? 1 : Math.max(0, 1 - difValor / (valor * tol));
    let scoreData = 0.5;
    if (compra.data_compra && t.data_competencia) {
      const dias = Math.abs((new Date(t.data_competencia) - new Date(compra.data_compra)) / 86400000);
      scoreData = Math.max(0, 1 - dias / (antes + depois));
    }
    const scoreTexto = simTexto(alvoTexto, t.descricao);
    const score = 0.55 * scoreValor + 0.25 * scoreData + 0.20 * scoreTexto;
    return {
      ...t,
      valor_exato: difValor < 0.01,
      ja_vinculada_outra: usadasPorOutra.has(t.id),
      score: Number(score.toFixed(3)),
    };
  })
    .sort((a, b) => (a.ja_vinculada_outra - b.ja_vinculada_outra) || (b.score - a.score))
    .slice(0, limite);

  return ranked;
}

module.exports = { sugerirSaidas };
