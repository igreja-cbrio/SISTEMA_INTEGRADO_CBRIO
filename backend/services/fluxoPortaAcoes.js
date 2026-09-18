// ════════════════════════════════════════════════════════════════════════════
//  FLUXOS DE PORTA · leitura e escrita das AÇÕES HUMANAS (`flx_acoes`)
//
//  A régua (quais etapas, que prazo, quem deve) é PURA e vive em
//  `utils/portaFluxos.js`, no gate. Aqui só tem banco.
//
//  ⚠️⚠️ A escrita passa OBRIGATORIAMENTE por `validarDesfecho` antes de tocar no
//  banco. A tabela não tem CHECK no `resultado` de propósito (o catálogo vive no
//  código), então esta função é a ÚNICA guarda — e por isso a migration não abre
//  INSERT pra `authenticated`.
// ════════════════════════════════════════════════════════════════════════════
const { supabase } = require('../utils/supabase');
const { fluxoDaPorta, validarDesfecho } = require('../utils/portaFluxos');

/**
 * Ações de um conjunto de linhas da porta.
 * Devolve { [refId]: { [etapa]: acao } } — o formato que `estadoDoFluxo` espera.
 * ⚠️ Pagina em lotes de 200 no `.in()`: lista de 1.000 ids numa URL estoura.
 */
async function acoesPorRef(porta, refIds) {
  const ids = [...new Set((refIds || []).filter(Boolean))];
  const mapa = {};
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data, error } = await supabase.from('flx_acoes')
      .select('ref_id, etapa, resultado, encaminhamento, observacao, feito_por, feito_por_nome, feito_em')
      .eq('porta', porta).in('ref_id', lote).is('deleted_at', null);
    if (error) throw error;
    for (const a of data || []) {
      if (!mapa[a.ref_id]) mapa[a.ref_id] = {};
      mapa[a.ref_id][a.etapa] = a;
    }
  }
  return mapa;
}

/**
 * Registra (ou corrige) a ação de uma etapa.
 *
 * ⚠️ UPSERT pela chave única (porta, ref_id, etapa) entre as vivas: registrar
 * duas vezes CORRIGE, não duplica. Quem erra o desfecho tem que conseguir
 * consertar — sem isso a equipe deixa de registrar por medo de errar, que é
 * como se chega a zero desfechos.
 */
async function registrarDesfecho({ porta, refId, membroId, resultado, encaminhamento, observacao, usuario }) {
  const f = fluxoDaPorta(porta);
  if (!f) return { erro: 'Porta desconhecida.' };
  const v = validarDesfecho({ resultado, encaminhamento });
  if (!v.ok) return { erro: v.erro, campo: v.campo };

  const etapa = (f.etapas.find((e) => e.encerra) || {}).chave;
  if (!etapa) return { erro: 'Este fluxo não tem etapa de encerramento.' };

  const agora = new Date().toISOString();
  const linha = {
    porta, ref_tipo: f.refTipo, ref_id: refId, membro_id: membroId || null,
    etapa, resultado: v.resultado, encaminhamento: v.encaminhamento,
    observacao: String(observacao || '').trim().slice(0, 1000) || null,
    feito_por: usuario?.userId || usuario?.id || null,
    feito_por_nome: usuario?.nome || usuario?.name || null,
    feito_em: agora,
  };

  const { data: ja } = await supabase.from('flx_acoes')
    .select('id').eq('porta', porta).eq('ref_id', refId).eq('etapa', etapa)
    .is('deleted_at', null).maybeSingle();

  if (ja) {
    const { data, error } = await supabase.from('flx_acoes')
      .update({ ...linha, atualizado_em: agora }).eq('id', ja.id).select().maybeSingle();
    if (error) throw error;
    return { acao: data, corrigida: true };
  }
  const { data, error } = await supabase.from('flx_acoes').insert(linha).select().maybeSingle();
  if (error) throw error;
  return { acao: data, corrigida: false };
}

/** Desfaz um desfecho (soft-delete · a chave única é parcial, então libera). */
async function apagarDesfecho({ porta, refId }) {
  const f = fluxoDaPorta(porta);
  if (!f) return { erro: 'Porta desconhecida.' };
  const etapa = (f.etapas.find((e) => e.encerra) || {}).chave;
  const { data, error } = await supabase.from('flx_acoes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('porta', porta).eq('ref_id', refId).eq('etapa', etapa)
    .is('deleted_at', null).select('id');
  if (error) throw error;
  return { apagadas: data?.length || 0 };
}

module.exports = { acoesPorRef, registrarDesfecho, apagarDesfecho };
