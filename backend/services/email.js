// Envio de e-mail do backend.
//
// Canal PRIMÁRIO = Microsoft Graph (mesma configuração já usada pelo SharePoint/
// Cérebro · MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).
// Fallback = Resend (se RESEND_API_KEY existir). Fail-soft: sem nenhum canal
// configurado, retorna { ok:false } sem quebrar o fluxo (os outros canais de
// notificação seguem).
//
// Remetente (Graph): GRAPH_MAIL_SENDER || MERGE_MAIL_SENDER || 'noreply@cbrio.org'
//   (precisa ser uma caixa real do tenant · o app Azure precisa de Mail.Send).
// Resend (fallback): RESEND_FROM (default 'CBRio <onboarding@resend.dev>').

const { getGraphToken } = require('./storageService');

function graphConfigurado() {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  );
}

function resendConfigurado() {
  return !!process.env.RESEND_API_KEY;
}

function isConfigured() {
  return graphConfigurado() || resendConfigurado();
}

function remetenteGraph() {
  return process.env.GRAPH_MAIL_SENDER || process.env.MERGE_MAIL_SENDER || 'noreply@cbrio.org';
}

async function enviarViaGraph({ to, subject, html, text, from }) {
  const sender = from || remetenteGraph();
  const token = await getGraphToken();
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(address => ({ emailAddress: { address } }));
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: String(subject || '(sem assunto)'),
          body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
          toRecipients: recipients,
        },
        saveToSentItems: true,
      }),
    },
  );
  if (resp.status === 202) return { ok: true };
  const txt = await resp.text().catch(() => '');
  console.error('[email] Graph sendMail falhou', resp.status, txt.slice(0, 300));
  return { ok: false, error: `Graph HTTP ${resp.status}` };
}

async function enviarViaResend({ to, subject, html, text, from }) {
  const key = process.env.RESEND_API_KEY;
  const remetente = from || process.env.RESEND_FROM || 'CBRio <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: Array.isArray(to) ? to : [to],
        subject: String(subject || '(sem assunto)'),
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[email] Resend erro', resp.status, JSON.stringify(data));
      return { ok: false, error: data?.message || `HTTP ${resp.status}` };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error('[email] Resend exceção', e.message);
    return { ok: false, error: e.message };
  }
}

async function enviarEmail({ to, subject, html, text, from } = {}) {
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, error: 'destinatário ausente' };

  if (graphConfigurado()) {
    try {
      const r = await enviarViaGraph({ to, subject, html, text, from });
      if (r.ok) return r;
      if (resendConfigurado()) return enviarViaResend({ to, subject, html, text, from });
      return r;
    } catch (e) {
      console.error('[email] Graph exceção', e.message);
      if (resendConfigurado()) return enviarViaResend({ to, subject, html, text, from });
      return { ok: false, error: e.message };
    }
  }

  if (resendConfigurado()) return enviarViaResend({ to, subject, html, text, from });
  return { ok: false, error: 'nenhum canal de e-mail configurado (MICROSOFT_* ou RESEND_API_KEY)' };
}

module.exports = { enviarEmail, isConfigured };
