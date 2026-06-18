#!/usr/bin/env node
/**
 * Resumo do merge por e-mail (para o Eduardo).
 *
 * Roda no GitHub Actions a cada PR mergeada na main. Lê o conteudo da PR,
 * pede ao Claude Haiku um resumo curto em linguagem de leigo (PT-BR) e envia
 * por e-mail via Microsoft Graph (mesmas credenciais usadas no SharePoint).
 *
 * Nao toca no app nem no banco em producao — roda 100% no CI.
 *
 * Variaveis de ambiente esperadas (secrets do GitHub Actions):
 *   PR_NUMBER               numero da PR
 *   REPO                    owner/repo (ex.: igreja-cbrio/sistema_integrado_cbrio)
 *   GH_TOKEN                token do Actions (para o gh CLI)
 *   ANTHROPIC_API_KEY       chave da Anthropic (resumo de IA)
 *   MICROSOFT_TENANT_ID     credenciais do app Azure (Microsoft Graph)
 *   MICROSOFT_CLIENT_ID
 *   MICROSOFT_CLIENT_SECRET
 *   MERGE_MAIL_SENDER       caixa de e-mail remetente (UPN real do tenant)
 *   MERGE_MAIL_TO           destinatario (default: eduardo@cbrio.com.br)
 *
 * Se faltar algum secret obrigatorio, o script apenas avisa e sai com sucesso
 * (nao quebra o CI com falha vermelha enquanto a configuracao nao estiver pronta).
 */

import { execSync } from 'node:child_process';

const env = process.env;
const TO = env.MERGE_MAIL_TO || 'eduardo@cbrio.com.br';
const MODEL = 'claude-haiku-4-5-20251001';

const REQUIRED = [
  'PR_NUMBER',
  'ANTHROPIC_API_KEY',
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MERGE_MAIL_SENDER',
];

const faltando = REQUIRED.filter((k) => !env[k]);
if (faltando.length) {
  console.warn(`[resumo-merge] Secrets ausentes: ${faltando.join(', ')}. Pulando envio (configure no GitHub > Settings > Secrets).`);
  process.exit(0);
}

function gh(args) {
  return execSync(`gh ${args}`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function truncar(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '\n…(truncado)' : str;
}

async function main() {
  const repoFlag = env.REPO ? `--repo ${env.REPO}` : '';

  // 1. Contexto da PR via gh CLI
  let pr;
  try {
    pr = JSON.parse(
      gh(`pr view ${env.PR_NUMBER} ${repoFlag} --json number,title,body,url,author,files,commits`),
    );
  } catch (e) {
    console.error('[resumo-merge] Falha ao ler a PR:', e.message);
    process.exit(1);
  }

  const arquivos = (pr.files || []).map((f) => f.path).slice(0, 80).join('\n');
  const commits = (pr.commits || [])
    .map((c) => c.messageHeadline || (c.messageBody || '').split('\n')[0])
    .filter(Boolean)
    .slice(0, 50)
    .join('\n');

  let diff = '';
  try {
    diff = truncar(gh(`pr diff ${env.PR_NUMBER} ${repoFlag}`), 12000);
  } catch {
    /* diff e best-effort */
  }

  // 2. Resumo de IA (Claude Haiku) em linguagem de leigo
  const prompt = [
    'Voce escreve para o Eduardo, um diretor administrativo de uma igreja que NAO e tecnico.',
    'Resuma, em portugues do Brasil com acentuacao correta, o que esta atualizacao do sistema fez,',
    'de um jeito simples e direto, SEM jargao tecnico (nada de "endpoint", "trigger", "migration", "RLS", "deploy" etc.).',
    'Foque no que muda na pratica para o dia a dia da igreja / das equipes. Seja breve:',
    'no maximo 4 frases curtas OU ate 4 itens de lista. Se a mudanca for puramente tecnica interna,',
    'sem efeito visivel para os usuarios, diga isso em 1 frase simples.',
    'Comece direto pelo resumo, sem saudacao e sem repetir o titulo.',
    '',
    `Titulo da atualizacao: ${pr.title || '(sem titulo)'}`,
    '',
    'Descricao tecnica (escrita pela equipe):',
    truncar(pr.body || '(sem descricao)', 4000),
    '',
    'Arquivos alterados:',
    arquivos || '(nao informado)',
    '',
    'Lista de mudancas (commits):',
    commits || '(nao informado)',
    diff ? `\nTrecho das alteracoes de codigo (referencia):\n${diff}` : '',
  ].join('\n');

  let resumo;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[resumo-merge] Erro da Anthropic:', JSON.stringify(data));
      process.exit(1);
    }
    resumo = (data.content || []).map((b) => b.text || '').join('').trim();
  } catch (e) {
    console.error('[resumo-merge] Falha ao gerar o resumo:', e.message);
    process.exit(1);
  }
  if (!resumo) resumo = 'Resumo indisponivel no momento. Veja os detalhes no link abaixo.';

  // 3. Token do Microsoft Graph (client credentials · igual ao SharePoint)
  let token;
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      },
    );
    const data = await res.json();
    token = data.access_token;
    if (!token) throw new Error(data.error_description || data.error || 'sem access_token');
  } catch (e) {
    console.error('[resumo-merge] Falha na autenticacao do Graph:', e.message);
    process.exit(1);
  }

  // 4. Monta e envia o e-mail
  const resumoHtml = resumo
    .split(/\n+/)
    .map((linha) => {
      const t = linha.trim();
      if (!t) return '';
      const semBullet = t.replace(/^[-*•]\s*/, '');
      return /^[-*•]\s+/.test(t)
        ? `<li>${escapeHtml(semBullet)}</li>`
        : `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;
    })
    .join('\n')
    .replace(/(<li>[\s\S]*<\/li>)/, '<ul style="margin:0 0 12px;padding-left:20px">$1</ul>');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:640px">
    <p style="margin:0 0 12px">Olá, Eduardo,</p>
    <p style="margin:0 0 16px">Uma atualização acabou de entrar no sistema. Em resumo:</p>
    <div style="background:#f4faf9;border-left:4px solid #00B39D;padding:14px 16px;border-radius:6px;margin:0 0 18px">
      ${resumoHtml}
    </div>
    <p style="margin:0 0 4px;color:#555;font-size:13px">Detalhes técnicos (para a equipe):</p>
    <p style="margin:0 0 16px;font-size:13px"><a href="${escapeHtml(pr.url)}" style="color:#00B39D">${escapeHtml(pr.title || '')} (#${pr.number})</a></p>
    <p style="margin:0;color:#999;font-size:12px">Mensagem automática do sistema CBRio.</p>
  </div>`;

  const assunto = `Atualização no sistema — #${pr.number}: ${pr.title || ''}`.slice(0, 200);

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MERGE_MAIL_SENDER)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: assunto,
            body: { contentType: 'HTML', content: html },
            toRecipients: [{ emailAddress: { address: TO } }],
          },
          saveToSentItems: true,
        }),
      },
    );
    if (res.status !== 202) {
      const txt = await res.text();
      console.error(`[resumo-merge] sendMail falhou (HTTP ${res.status}):`, txt);
      process.exit(1);
    }
  } catch (e) {
    console.error('[resumo-merge] Falha ao enviar o e-mail:', e.message);
    process.exit(1);
  }

  console.log(`[resumo-merge] E-mail enviado para ${TO} (PR #${pr.number}).`);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch((e) => {
  console.error('[resumo-merge] Erro inesperado:', e);
  process.exit(1);
});
