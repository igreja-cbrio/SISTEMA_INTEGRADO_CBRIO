// Envio de e-mail via Resend (https://resend.com).
// Sem dependência nova · usa fetch. Fail-soft: sem RESEND_API_KEY, retorna
// { ok:false } sem quebrar o fluxo (os outros canais seguem).
//
// Envs (Vercel):
//   RESEND_API_KEY  · chave da conta Resend (secreta)
//   RESEND_FROM     · remetente (default 'CBRio <onboarding@resend.dev>').
//                     Pra mandar de @cbrio.org, verifique o domínio no Resend
//                     e troque pra ex.: 'CBRio <avisos@cbrio.org>'.

async function enviarEmail({ to, subject, html, text, from } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY não configurada' };
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, error: 'destinatário ausente' };
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
    console.error('[email] exceção', e.message);
    return { ok: false, error: e.message };
  }
}

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

module.exports = { enviarEmail, isConfigured };
