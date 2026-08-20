#!/usr/bin/env node
/**
 * Avisa quando o deploy de produção FALHA.
 *
 * ⚠️ Só falha. O job `notify-email`, que mandava "Produção no ar" a CADA deploy,
 * foi removido em 23/06/2026 porque enchia a caixa do Eduardo — a nota está no
 * próprio deploy-vercel.yml. Este script existe pelo motivo OPOSTO: hoje, se o
 * workflow de deploy quebra, ninguém fica sabendo e o sistema simplesmente para
 * de atualizar em silêncio. Sucesso continua sem e-mail nenhum.
 *
 * ⚠️ NUNCA derruba o workflow. Ele roda depois de um deploy que já falhou; se o
 * envio do aviso também falhar, o log mostra o motivo mas o job sai com 0 — um
 * alerta que quebra o CI transforma um problema em dois, e o vermelho do deploy
 * já está lá pra ser visto.
 *
 * Variáveis: MICROSOFT_TENANT_ID · MICROSOFT_CLIENT_ID · MICROSOFT_CLIENT_SECRET
 *            MERGE_MAIL_SENDER (remetente) · DEPLOY_ALERTA_TO (destino)
 * Contexto:  GITHUB_* (preenchidas pelo Actions)
 */

const env = process.env;
const TO = env.DEPLOY_ALERTA_TO || 'matheus.toscano@cbrio.org';

const faltando = ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MERGE_MAIL_SENDER']
  .filter((k) => !env[k]);
if (faltando.length) {
  // Sai em VERDE de propósito: configuração incompleta não pode virar um
  // segundo alarme por cima do deploy que já falhou.
  console.error(`[alerta-deploy] configuração incompleta, sem envio: ${faltando.join(', ')}`);
  process.exit(0);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const repo = env.GITHUB_REPOSITORY || 'igreja-cbrio/SISTEMA_INTEGRADO_CBRIO';
const runUrl = `https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID || ''}`;
const sha = (env.GITHUB_SHA || '').slice(0, 7);
const commitUrl = `https://github.com/${repo}/commit/${env.GITHUB_SHA || ''}`;
const msg = (env.COMMIT_MENSAGEM || '').split('\n')[0];
const autor = env.COMMIT_AUTOR || '';

const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:640px">
  <p style="margin:0 0 14px"><strong>O deploy de produção falhou.</strong> O sistema continua no ar com a versão anterior — o que mudou neste commit <em>não</em> subiu.</p>
  <div style="background:#fdf2f2;border-left:4px solid #ef4444;padding:14px 16px;border-radius:6px;margin:0 0 18px">
    <p style="margin:0 0 6px"><strong>${esc(msg) || 'commit sem mensagem'}</strong></p>
    <p style="margin:0;color:#555;font-size:13px">
      ${esc(sha)}${autor ? ` · ${esc(autor)}` : ''} · <a href="${esc(commitUrl)}" style="color:#00B39D">ver o commit</a>
    </p>
  </div>
  <p style="margin:0 0 16px"><a href="${esc(runUrl)}" style="color:#00B39D;font-weight:bold">Abrir o log da execução</a> para ver em qual etapa parou.</p>
  <p style="margin:0;color:#999;font-size:12px">Aviso automático · enviado somente quando o deploy falha.</p>
</div>`;

try {
  const r = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(data.error_description || data.error || 'sem access_token');

  const envio = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MERGE_MAIL_SENDER)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: `⚠️ Deploy de produção falhou — ${sha || 'CBRio'}`.slice(0, 200),
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: TO } }],
        },
        saveToSentItems: true,
      }),
    },
  );
  if (envio.status !== 202) {
    console.error(`[alerta-deploy] sendMail HTTP ${envio.status}:`, await envio.text());
    process.exit(0);
  }
  console.log(`[alerta-deploy] aviso enviado para ${TO}`);
} catch (e) {
  console.error('[alerta-deploy] falha ao enviar:', e.message);
  process.exit(0);
}
