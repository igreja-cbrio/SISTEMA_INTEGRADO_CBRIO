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
const { nomeDeExibicao, remetenteResend } = require('../utils/remetenteEmail');

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

/**
 * Anexos no formato interno `{ nome, tipo, base64 }`. O TETO existe porque o
 * sendMail do Graph recusa requisição acima de ~4 MB (anexo grande exige upload
 * session, que não construímos): anexo que estoura é DESCARTADO com aviso — o
 * e-mail sai sem ele, nunca deixa de sair. Quem anexa deve sempre pôr o LINK do
 * arquivo no corpo também (é a rede pra este descarte).
 */
const TETO_ANEXOS_BYTES = 3 * 1024 * 1024; // do base64, com folga pro teto de 4 MB do Graph

function anexosDentroDoTeto(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  const ok = [];
  let total = 0;
  for (const a of attachments) {
    if (!a || !a.base64 || !a.nome) continue;
    total += a.base64.length;
    if (total > TETO_ANEXOS_BYTES) {
      console.warn(`[email] anexo "${a.nome}" descartado (estourou o teto de anexos do e-mail)`);
      continue;
    }
    ok.push(a);
  }
  return ok;
}

async function enviarViaGraph({ to, subject, html, text, from, fromName, attachments }) {
  const sender = from || remetenteGraph();
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(address => ({ emailAddress: { address } }));
  const anexos = anexosDentroDoTeto(attachments);
  const body = JSON.stringify({
    message: {
      subject: String(subject || '(sem assunto)'),
      body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
      toRecipients: recipients,
      // ⚠️ O nome de exibição é SEMPRE nosso, nunca o da caixa. Sem esta linha
      // o Graph usa o display name de `GRAPH_MAIL_SENDER` — que é "Email
      // Automático - CBRio" — e só os poucos fluxos que passavam `fromName`
      // chegavam como "CBRio". O endereço não muda: só o nome.
      from: { emailAddress: { address: sender, name: nomeDeExibicao(fromName) } },
      ...(anexos.length ? {
        attachments: anexos.map(a => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: String(a.nome).slice(0, 200),
          contentType: a.tipo || 'application/octet-stream',
          contentBytes: a.base64,
        })),
      } : {}),
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

async function enviarViaResend({ to, subject, html, text, from, fromName, attachments }) {
  const key = process.env.RESEND_API_KEY;
  // `from` explícito manda (o chamador escolheu endereço e nome). Sem ele, o
  // endereço vem da env e o NOME é o nosso — senão o fallback chegaria com
  // remetente diferente do canal primário.
  const remetente = from
    || remetenteResend(process.env.RESEND_FROM || 'onboarding@resend.dev', fromName);
  const anexos = anexosDentroDoTeto(attachments);
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
        ...(anexos.length ? {
          attachments: anexos.map(a => ({ filename: String(a.nome).slice(0, 200), content: a.base64 })),
        } : {}),
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

async function enviarEmail({ to, subject, html, text, from, fromName, attachments } = {}) {
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, error: 'destinatário ausente' };

  // ⚠️ O Resend está em MODO TESTE (sem domínio verificado) → só entrega pro
  // e-mail do dono da conta e recusa todo o resto. Como fallback ele não salva
  // ninguém e ainda mascara o erro real do Graph com a mensagem de teste dele.
  // Por isso o fallback só liga com RESEND_FALLBACK=1 (setar SÓ depois de
  // verificar um domínio em resend.com/domains). Sem isso, Graph é o único
  // canal e o erro reportado é o verdadeiro.
  const resendFallbackAtivo = resendConfigurado() && process.env.RESEND_FALLBACK === '1';

  if (graphConfigurado()) {
    const r = await enviarViaGraph({ to, subject, html, text, from, fromName, attachments }); // já tem retry + try/catch internos
    if (r.ok) return r;
    if (resendFallbackAtivo) return enviarViaResend({ to, subject, html, text, from, fromName, attachments });
    return r; // erro real do Graph (não mascara com a mensagem do Resend em teste)
  }

  if (resendConfigurado()) return enviarViaResend({ to, subject, html, text, from, fromName, attachments });
  return { ok: false, error: 'nenhum canal de e-mail configurado (MICROSOFT_* ou RESEND_API_KEY)' };
}

module.exports = { enviarEmail, isConfigured };
