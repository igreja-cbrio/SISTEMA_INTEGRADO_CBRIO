const { supabase } = require('../utils/supabase');

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
async function notificar({ modulo, tipo, titulo, mensagem, link, severidade = 'info', chaveDedup, targetIds }) {
  const destinatarios = targetIds || await resolverDestinatarios(modulo);
  if (!destinatarios.length) return 0;

  let inserted = 0;
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
    if (!error) inserted++;
  }
  return inserted;
}

module.exports = { notificar, resolverDestinatarios };
