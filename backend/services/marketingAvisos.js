'use strict';
// Avisos do Marketing que mais de uma porta de escrita dispara (Kanban em
// routes/marketing.js e linha do tempo em routes/marketingLinha.js). Uma cópia
// só: duas redações do mesmo aviso divergiriam, e a chaveDedup também.
// Tudo best-effort: o dado já está gravado quando o aviso sai.

const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');
const { solicitanteDoCard } = require('./marketingSolicitante');

// Aviso de entrega ao solicitante · a MESMA mensagem pelos dois caminhos que
// concluem um card: arrastar no Kanban (PATCH /cards/:id) e o checklist completo
// (o gatilho fn_marketing_checklist_fecha_card, que roda no banco e não avisa
// ninguém sozinho). chaveDedup por card: fechar, reabrir e fechar não repete.
function avisarEntregue(card, sol) {
  if (!sol?.solicitante_id) return;
  notificar({
    modulo: 'marketing',
    tipo: 'marketing_card_entregue',
    titulo: `Entregue: ${sol.titulo_solicitacao}`,
    mensagem: 'Sua solicitação foi marcada como entregue. Avalie em 30 segundos.',
    link: '/solicitacoes',
    severidade: 'info',
    chaveDedup: `marketing_card_entregue_${card.id}`,
    targetIds: [sol.solicitante_id],
  }).catch(err => console.error('[MARKETING] notify entregue:', err.message));
}

// O checklist mexeu: se o gatilho levou o card a 'concluido' (antes não estava),
// avisa o solicitante. Best-effort: o item já está gravado e o aviso não pode
// desfazê-lo. Erro de consulta só loga (é o mesmo tratamento do PATCH /cards).
async function avisarSeChecklistConcluiu(cardId, estadoAntes) {
  if (estadoAntes === 'concluido') return;
  try {
    const { data: card, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, estado, campanha_id, solicitacao_id')
      .eq('id', cardId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!card || card.estado !== 'concluido') return;
    const sol = await solicitanteDoCard(card);
    if (sol?.erro) { console.error('[MARKETING] solicitante do card (não avisou):', sol.motivo); return; }
    avisarEntregue(card, sol);
  } catch (e) { console.error('[MARKETING] aviso pós-checklist:', e.message); }
}

// O Pedro definiu/mudou a entrega final e ela difere da data que o solicitante
// pediu: avisa (o Pedro vai conversar e dar a 1a devolutiva).
async function avisarPrazoAjustado(campanha) {
  if (!campanha?.solicitacao_id || !campanha?.solicitante_id) return;
  try {
    const { data: sol } = await supabase.from('solicitacoes')
      .select('data_necessaria, titulo').eq('id', campanha.solicitacao_id).maybeSingle();
    const pedida = sol?.data_necessaria ? new Date(sol.data_necessaria).toISOString().slice(0, 10) : null;
    const nova = campanha.prazo_entrega ? new Date(campanha.prazo_entrega).toISOString().slice(0, 10) : null;
    if (!nova || !pedida || nova === pedida) return;
    const fmt = (d) => d.split('-').reverse().join('/');
    notificar({
      modulo: 'marketing',
      tipo: 'marketing_prazo_ajustado',
      titulo: `Prazo ajustado: ${sol?.titulo || campanha.titulo}`,
      mensagem: `A equipe de Marketing ajustou a entrega de ${fmt(pedida)} para ${fmt(nova)}. O Pedro vai falar com você sobre isso.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `mkt_prazo_${campanha.id}_${nova}`,
      targetIds: [campanha.solicitante_id],
    }).catch(err => console.error('[MARKETING] notify prazo ajustado:', err.message));
  } catch (e) { console.error('[MARKETING] prazo ajustado block:', e.message); }
}

// Tarefa nova (ou que mudou de dono) na linha do tempo: avisa quem vai fazer.
// Mesma chaveDedup do Kanban: a pessoa não recebe dois avisos pela mesma tarefa.
async function avisarAtribuidos(card, membroIds) {
  const ids = [...new Set((membroIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    const { data: membros, error } = await supabase
      .from('marketing_membros').select('profile_id').in('id', ids);
    if (error) throw error;
    for (const pid of [...new Set((membros || []).map(m => m.profile_id).filter(Boolean))]) {
      notificar({
        modulo: 'marketing',
        tipo: 'marketing_card_atribuido',
        titulo: `Nova task: ${card.titulo}`,
        mensagem: 'Pedro Paiva atribuiu uma task pra você. Está na linha do tempo do Marketing.',
        link: '/marketing/linha-do-tempo',
        severidade: 'info',
        chaveDedup: `marketing_card_atribuido_${card.id}_${pid}`,
        targetIds: [pid],
      }).catch(err => console.error('[MARKETING] notify atribuido:', err.message));
    }
  } catch (e) { console.error('[MARKETING] aviso atribuído:', e.message); }
}

module.exports = { avisarEntregue, avisarSeChecklistConcluiu, avisarPrazoAjustado, avisarAtribuidos };
