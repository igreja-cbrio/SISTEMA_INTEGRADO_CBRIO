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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function enviarViaGraph({ to, subject, html, text, from, fromName }) {
  const sender = from || remetenteGraph();
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(address => ({ emailAddress: { address } }));
  const body = JSON.stringify({
    message: {
      subject: String(subject || '(sem assunto)'),
      body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
      toRecipients: recipients,
      // fromName sobrescreve o display name da caixa (ex.: "Voluntariado CBRio"
      // em vez de "Email Automático - CBRio") mantendo o mesmo endereço.
      ...(fromName ? { from: { emailAddress: { address: sender, name: fromName } } } : {}),
    },
    saveToSentItems: true,
  });
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

  // Retry em falha TRANSITÓRIA (429 throttling · 5xx · timeout/rede). Um blip
  // num único envio dentro de um blast grande derrubava o destinatário pro
  // fallback; agora tenta de novo antes de desistir.
  const TENTATIVAS = 3;
  let ultimoErro = 'Graph falhou';
  for (let n = 1; n <= TENTATIVAS; n += 1) {
    try {
      const token = await getGraphToken();
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
      });
      if (resp.status === 202) return { ok: true };
      const txt = await resp.text().catch(() => '');
      ultimoErro = `Graph HTTP ${resp.status}`;
      console.error('[email] Graph sendMail falhou', resp.status, txt.slice(0, 300), `(tentativa ${n}/${TENTATIVAS})`);
      // erro definitivo (4xx que não é 429) não melhora tentando de novo.
      if (resp.status !== 429 && resp.status < 500) return { ok: false, error: ultimoErro };
    } catch (e) {
      ultimoErro = e.message || 'exceção Graph';
      console.error('[email] Graph exceção', ultimoErro, `(tentativa ${n}/${TENTATIVAS})`);
    }
    if (n < TENTATIVAS) await sleep(1500 * n); // backoff: 1,5s · 3s
  }
  return { ok: false, error: ultimoErro };
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

async function enviarEmail({ to, subject, html, text, from, fromName } = {}) {
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, error: 'destinatário ausente' };

  // ⚠️ O Resend está em MODO TESTE (sem domínio verificado) → só entrega pro
  // e-mail do dono da conta e recusa todo o resto. Como fallback ele não salva
  // ninguém e ainda mascara o erro real do Graph com a mensagem de teste dele.
  // Por isso o fallback só liga com RESEND_FALLBACK=1 (setar SÓ depois de
  // verificar um domínio em resend.com/domains). Sem isso, Graph é o único
  // canal e o erro reportado é o verdadeiro.
  const resendFallbackAtivo = resendConfigurado() && process.env.RESEND_FALLBACK === '1';

  if (graphConfigurado()) {
    const r = await enviarViaGraph({ to, subject, html, text, from, fromName }); // já tem retry + try/catch internos
    if (r.ok) return r;
    if (resendFallbackAtivo) return enviarViaResend({ to, subject, html, text, from });
    return r; // erro real do Graph (não mascara com a mensagem do Resend em teste)
  }

  if (resendConfigurado()) return enviarViaResend({ to, subject, html, text, from });
  return { ok: false, error: 'nenhum canal de e-mail configurado (MICROSOFT_* ou RESEND_API_KEY)' };
}

module.exports = { enviarEmail, isConfigured };
