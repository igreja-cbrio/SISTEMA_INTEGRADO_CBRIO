const { supabase } = require('../utils/supabase');
const { enviarPushParaUsers } = require('./webpush');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

function escapeHtmlNotif(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Dispara e-mail (best-effort · Resend) para os usuários notificados. No-op
// gracioso se RESEND_API_KEY não estiver configurada. Resolve o e-mail de cada
// destinatário em profiles.email.
async function enviarEmailNotificacao(userIds, { titulo, mensagem, link }) {
  if (!emailConfigurado() || !userIds?.length) return;
  try {
    const { data: profs } = await supabase
      .from('profiles')
      .select('email')
      .in('id', userIds);
    const tos = [...new Set((profs || []).map(p => p.email).filter(e => e && /@/.test(e)))];
    if (!tos.length) return;
    const base = process.env.FRONTEND_URL || '';
    const url = link ? (/^https?:\/\//.test(link) ? link : base + link) : base;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:600px">
        <p style="margin:0 0 10px"><strong>${escapeHtmlNotif(titulo)}</strong></p>
        <p style="margin:0 0 16px">${escapeHtmlNotif(mensagem || '')}</p>
        ${url ? `<p style="margin:0 0 16px"><a href="${escapeHtmlNotif(url)}" style="background:#00B39D;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir no sistema</a></p>` : ''}
        <p style="margin:0;color:#999;font-size:12px">Mensagem automática do sistema CBRio.</p>
      </div>`;
    const r = await enviarEmail({
      to: tos,
      subject: titulo,
      html,
      text: `${titulo}\n\n${mensagem || ''}${url ? `\n\n${url}` : ''}`,
    });
    if (!r?.ok) console.warn('[notificar email] falhou:', r?.error);
  } catch (e) {
    console.warn('[notificar email] exceção:', e.message);
  }
}

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
async function notificar({ modulo, tipo, titulo, mensagem, link, severidade = 'info', chaveDedup, targetIds, extraTargetIds, email = false }) {
  let destinatarios = targetIds || await resolverDestinatarios(modulo);
  if (extraTargetIds?.length) {
    destinatarios = [...new Set([...(destinatarios || []), ...extraTargetIds.filter(Boolean)])];
  }
  if (!destinatarios.length) {
    console.warn(`[notificar] sem destinatarios · modulo=${modulo} · titulo="${titulo}"`);
    return 0;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const usersInseridos = [];
  const erros = [];
  for (const userId of destinatarios) {
    // Dedup: não cria se já existe notificação não-lida com mesma chave
    if (chaveDedup) {
      const { count } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('chave_dedup', chaveDedup)
        .eq('lida', false);
      if (count > 0) { skipped++; continue; }
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
    } else {
      failed++;
      erros.push(`${userId.slice(0, 8)}: ${error.message}`);
    }
  }

  console.log(`[notificar] modulo=${modulo} alvos=${destinatarios.length} inseridos=${inserted} pulados=${skipped} falhas=${failed}${failed ? ' erros=' + erros.slice(0, 3).join('; ') : ''}`);

  // Dispara push em background (no-op se VAPID não configurado)
  if (usersInseridos.length) {
    enviarPushParaUsers(usersInseridos, {
      title: titulo,
      body: mensagem,
      url: link || '/',
      tag: chaveDedup || `${modulo}-${Date.now()}`,
    }).catch(e => console.warn('[notificar push]', e.message));
  }

  // Dispara e-mail em background (no-op se Resend não configurado · só quando
  // o chamador pede email:true). Usa usersInseridos pra herdar a dedup.
  if (email && usersInseridos.length) {
    enviarEmailNotificacao(usersInseridos, { titulo, mensagem, link })
      .catch(e => console.warn('[notificar email bg]', e.message));
  }

  return inserted;
}

module.exports = { notificar, resolverDestinatarios };
