const { supabase } = require('../utils/supabase');
const { enviarPushParaUsers } = require('./webpush');

/**
 * Resolve quais usuários devem receber notificação de um módulo.
 * 1. Verifica regras personalizadas (notificacao_regras)
 * 2. Fallback: todos admin/diretor
 */
async function resolverDestinatarios(modulo) {
  const { data: regras } = await supabase
    .from('notificacao_regras')
    .select('profile_id')
    .eq('modulo', modulo)
    .eq('ativo', true);

  if (regras?.length) return regras.map(r => r.profile_id);

  // Fallback: admin + diretor
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'diretor']);

  return (admins || []).map(a => a.id);
}

/**
 * Cria notificação para múltiplos usuários, com deduplicação.
 * chaveDedup: string única que identifica o evento (ex: "ferias_vencendo_uuid123")
 */
async function notificar({ modulo, tipo, titulo, mensagem, link, severidade = 'info', chaveDedup, targetIds, extraTargetIds }) {
  let destinatarios = targetIds || await resolverDestinatarios(modulo);
  if (extraTargetIds?.length) {
    destinatarios = [...new Set([...(destinatarios || []), ...extraTargetIds.filter(Boolean)])];
  }
  if (!destinatarios.length) return 0;

  let inserted = 0;
  const usersInseridos = [];
  for (const userId of destinatarios) {
    // Dedup: não cria se já existe notificação não-lida com mesma chave
    if (chaveDedup) {
      const { count } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('chave_dedup', chaveDedup)
        .eq('lida', false);
      if (count > 0) continue;
    }

    const { error } = await supabase.from('notificacoes').insert({
      usuario_id: userId,
      titulo,
      mensagem,
      tipo: tipo || modulo,
      link,
      modulo,
      severidade,
      chave_dedup: chaveDedup,
      lida: false,
    });
    if (!error) {
      inserted++;
      usersInseridos.push(userId);
    }
  }

  // Dispara push em background (no-op se VAPID nao configurado)
  if (usersInseridos.length) {
    enviarPushParaUsers(usersInseridos, {
      title: titulo,
      body: mensagem,
      url: link || '/',
      tag: chaveDedup || `${modulo}-${Date.now()}`,
    }).catch(e => console.warn('[notificar push]', e.message));
  }

  return inserted;
}

module.exports = { notificar, resolverDestinatarios };
