// ════════════════════════════════════════════════════════════════════════════
//  PEDIDO DE TRANSFERÊNCIA DE GRUPO · o caminho ÚNICO de criação (26/09/2026)
//
//  Extraído de `routes/app.js` (`POST /grupos/:grupoId/membros/:rowId/transferir`,
//  25/08) quando o WhatsApp virou a 2ª porta. Duas cópias do INSERT + aviso
//  divergiriam no primeiro ajuste — e o sintoma seria a Caixa de entrada
//  recebendo o pedido de uma porta e não o da outra.
//
//  ⚠️⚠️ ISTO NÃO MOVE NINGUÉM DE GRUPO. Cria a linha PENDENTE em
//  `mem_grupo_transferencias`; quem transfere é a coordenação, pela ação
//  `transferir` de `POST /api/grupos/transferencias/:id/resolver` (que cria o
//  vínculo no destino e depois encerra a origem). Ver a migration 20260825170000.
//
//  ⚠️ Quem VALIDA (gate do líder, vínculo ativo, líder principal, gênero do
//  destino) é o chamador — cada porta tem a sua régua de "pode pedir".
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('./notificar');
const { textoAvisoTransferencia } = require('../utils/avisoTransferenciaGrupo');

/**
 * Avisa a COORDENAÇÃO. Nunca lança — o pedido já está gravado.
 *
 * ⚠️⚠️ Quem precisa saber é a coordenação, não o dono de um grupo: é ela que
 * vai ESCOLHER o destino. Por isso `resolverDestinatarios('grupos')` (as regras
 * do módulo em `notificacao_regras`, nunca uma lista de nomes no código).
 * ⚠️ Lista VAZIA omite `targetIds` de propósito, pra cair no fallback de
 * admin/diretor: transferência é rara e pedido parado sem ninguém saber é pior
 * que aviso pra gente demais. `targetIds: []` seria SILÊNCIO.
 * ⚠️ AWAITED (era fire-and-forget na rota do app): em serverless o container
 * congela ao responder e o aviso se perdia no meio (lei de 31/07).
 */
async function avisarCoordenacao({ transferenciaId, origem, pessoaNome, grupoNome, motivo, destinoTexto }) {
  try {
    const coordenacao = await resolverDestinatarios('grupos').catch(() => []);
    const { titulo, mensagem } = textoAvisoTransferencia({ origem, pessoaNome, grupoNome, motivo, destinoTexto });
    const n = await notificar({
      modulo: 'grupos',
      tipo: 'grupo_transferencia_pedida',
      titulo,
      mensagem,
      link: '/grupos?tab=entrada',
      severidade: 'aviso',
      chaveDedup: `grupo_transf_${transferenciaId}`,
      ...(coordenacao.length ? { targetIds: coordenacao } : {}),
    });
    return n > 0;
  } catch (e) {
    console.warn('[grupoTransferencia] aviso à coordenação:', e.message);
    return false;
  }
}

/**
 * Cria (ou reencontra) o pedido PENDENTE de transferência.
 *
 * @returns `{ ok:true, ja_pedido:true, transferencia_id }` quando já existia ·
 *   `{ ok:true, ja_pedido:true, transferencia_id:null }` na corrida (23505) ·
 *   `{ ok:true, ja_pedido:false, transferencia_id, coordenacao_avisada }` quando criou.
 *   Erro de banco que não seja a corrida LANÇA — a rota responde 500.
 *
 * ⚠️ Conferir antes do INSERT é o que transforma o 23505 do índice
 * `uniq_grupo_transf_pendente` numa resposta amigável ("tocou duas vezes" é o
 * caso normal) — mas o índice é quem GARANTE.
 */
async function solicitarTransferencia({
  membroId, grupoOrigemId, grupoOrigemNome = '', vinculoId = null, motivo = null,
  pedidoPor = null, pedidoPorNome = null, origem = 'app',
  pessoaNome = null, destinoTexto = null,
} = {}) {
  const { data: jaPediu } = await supabase.from('mem_grupo_transferencias')
    .select('id, created_at').eq('membro_id', membroId)
    .eq('grupo_origem_id', grupoOrigemId).eq('status', 'pendente').limit(1).maybeSingle();
  if (jaPediu) return { ok: true, ja_pedido: true, transferencia_id: jaPediu.id };

  const { data: novo, error } = await supabase.from('mem_grupo_transferencias').insert({
    membro_id: membroId,
    grupo_origem_id: grupoOrigemId,
    vinculo_id: vinculoId,
    motivo,
    status: 'pendente',
    pedido_por: pedidoPor,
    // Snapshot de nome: em 86 dos 102 grupos ativos o líder não tem conta no
    // ERP, então resolver o nome depois pelo `pedido_por` não funcionaria.
    pedido_por_nome: pedidoPorNome,
    origem,
  }).select('id').single();
  if (error) {
    // Corrida com outra aba/toque: o índice parcial pegou. O pedido está registrado.
    if (error.code === '23505') return { ok: true, ja_pedido: true, transferencia_id: null };
    throw error;
  }

  const coordenacaoAvisada = await avisarCoordenacao({
    transferenciaId: novo?.id, origem, pessoaNome, grupoNome: grupoOrigemNome, motivo, destinoTexto,
  });
  return { ok: true, ja_pedido: false, transferencia_id: novo?.id || null, coordenacao_avisada: coordenacaoAvisada };
}

module.exports = { solicitarTransferencia };
