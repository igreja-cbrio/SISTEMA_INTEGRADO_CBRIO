// Cria uma DESPESA em fin_transacoes conciliando com o extrato (OFX) — o mesmo
// híbrido do fluxo de Nota Fiscal (financeiroV2 notas-compras/lancar): se existe
// exatamente 1 débito NÃO classificado do mesmo valor na janela [dataBase, +15d],
// a transação nasce 'conciliado' ligada ao bruto; senão nasce 'pendente'.
// NÃO faz aprender/notify/atualizar a fonte — quem chama faz. Único caminho de
// escrita de despesa a partir de documento (NF ou solicitação).
const { supabase } = require('../utils/supabase');

async function lancarDespesaConciliando({
  descricao, valor, dataBase, dataPagamento, referencia, observacoes,
  plano_contas_id, centro_custo_id, conta_id,
  classificacao_origem = 'manual', classificacao_confianca = null,
  createdBy, extras = {},
}) {
  const v = Math.abs(Number(valor) || 0);
  if (!v) return { erro: 'Valor inválido para lançamento.' };
  if (!plano_contas_id) return { erro: 'plano_contas_id obrigatório.' };
  if (!dataBase) return { erro: 'Data-base (competência) obrigatória.' };

  // Conciliação: 1 débito não-classificado, mesmo valor, dataBase..+15d.
  let bruto = null;
  try {
    const fimJanela = new Date(new Date(`${dataBase}T12:00:00`).getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const { data: candidatos } = await supabase.from('fin_lancamentos_brutos')
      .select('id, conta_id, valor, tipo_trn, data_lancamento, memo')
      .eq('ja_classificado', false)
      .in('valor', [-v, v])
      .gte('data_lancamento', dataBase)
      .lte('data_lancamento', fimJanela);
    const debitos = (candidatos || []).filter(c => c.tipo_trn === 'DEBIT' || Number(c.valor) < 0);
    if (debitos.length === 1) bruto = debitos[0]; // >1 → não escolhe sozinho (fica pendente · match manual)
  } catch (e) { console.error('[finLancamento] match extrato:', e.message); }

  const finalConta = bruto?.conta_id || conta_id;
  if (!finalConta) return { erro: 'Sem débito correspondente no extrato — informe a conta bancária.', precisaConta: true };

  const { data: transacao, error } = await supabase.from('fin_transacoes').insert({
    conta_id: finalConta,
    tipo: 'despesa',
    descricao,
    valor: v,
    data_competencia: dataBase,
    data_pagamento: bruto?.data_lancamento || dataPagamento || dataBase,
    status: bruto ? 'conciliado' : 'pendente',
    referencia: referencia || null,
    observacoes: observacoes || null,
    plano_contas_id,
    centro_custo_id: centro_custo_id || null,
    lancamento_bruto_id: bruto?.id || null,
    classificacao_origem,
    classificacao_confianca,
    created_by: createdBy || null,
    ...extras,
  }).select().single();
  if (error) return { erro: error.message };

  if (bruto) {
    try {
      await supabase.from('fin_lancamentos_brutos').update({ ja_classificado: true }).eq('id', bruto.id);
      await supabase.from('fin_fila_classificacao')
        .update({ status: 'ignorado', decidido_em: new Date().toISOString(), decidido_por: createdBy || null })
        .eq('lancamento_bruto_id', bruto.id).eq('status', 'pendente');
    } catch (e) { console.error('[finLancamento] marcar bruto:', e.message); }
  }
  return { transacao, conciliada: !!bruto, bruto };
}

module.exports = { lancarDespesaConciliando };
