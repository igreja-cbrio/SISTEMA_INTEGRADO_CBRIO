#!/usr/bin/env node
/**
 * Resumo SEMANAL por e-mail (para o Eduardo).
 *
 * Roda no GitHub Actions toda sexta-feira. Lista todas as PRs mergeadas na
 * main nos ultimos N dias (padrao 7), pede ao Claude Haiku UM resumo
 * consolidado em linguagem de leigo (PT-BR) do que mudou na semana e envia
 * por e-mail via Microsoft Graph (mesmas credenciais usadas no SharePoint).
 *
 * Substitui o antigo envio a cada merge — agora e um unico digest semanal,
 * pra nao lotar a caixa de entrada. Se nenhuma PR foi mergeada no periodo,
 * nao envia nada (silencio = semana sem mudancas).
 *
 * Nao toca no app nem no banco em producao — roda 100% no CI.
 *
 * Variaveis de ambiente esperadas (secrets do GitHub Actions):
 *   REPO                    owner/repo (ex.: igreja-cbrio/sistema_integrado_cbrio)
 *   DIAS                    janela em dias (default: 7)
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
const DIAS = Math.max(1, parseInt(env.DIAS || '7', 10) || 7);

const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MERGE_MAIL_SENDER',
];

const faltando = REQUIRED.filter((k) => !env[k]);
if (faltando.length) {
  console.warn(`[resumo-semanal] Secrets ausentes: ${faltando.join(', ')}. Pulando envio (configure no GitHub > Settings > Secrets).`);
  process.exit(0);
}

function gh(args) {
  return execSync(`gh ${args}`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function truncar(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '\n…(truncado)' : str;
}

function fmtData(d) {
  // DD/MM em horario de Brasilia
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

async function main() {
  const repoFlag = env.REPO ? `--repo ${env.REPO}` : '';

  const agora = new Date();
  const desde = new Date(agora.getTime() - DIAS * 24 * 60 * 60 * 1000);
  // Search do GitHub aceita timestamp ISO8601 (granularidade de segundos).
  const desdeIso = desde.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const periodo = `${fmtData(desde)} a ${fmtData(agora)}`;

  // 1. PRs mergeadas na main no periodo (via gh CLI + Search API)
  let prs;
  try {
    const raw = gh(
      `pr list ${repoFlag} --state merged --limit 100 ` +
        `--json number,title,body,url,mergedAt,author ` +
        `--search "base:main merged:>=${desdeIso} sort:created-asc"`,
    );
    prs = JSON.parse(raw || '[]');
  } catch (e) {
    console.error('[resumo-semanal] Falha ao listar as PRs:', e.message);
    process.exit(1);
  }

  // ordena pela data de merge (mais antigas primeiro)
  prs.sort((a, b) => new Date(a.mergedAt || 0) - new Date(b.mergedAt || 0));

  if (!prs.length) {
    console.log(`[resumo-semanal] Nenhuma PR mergeada em ${periodo}. Sem e-mail esta semana.`);
    process.exit(0);
  }

  // 2. Contexto consolidado pra IA (sem diff — titulo + descricao bastam)
  const blocos = prs
    .map((pr, i) => {
      return [
        `### Atualizacao ${i + 1} — #${pr.number}: ${pr.title || '(sem titulo)'}`,
        truncar(pr.body || '(sem descricao)', 1500),
      ].join('\n');
    })
    .join('\n\n');

  const prompt = [
    'Voce escreve para o Eduardo, um diretor administrativo de uma igreja que NAO e tecnico.',
    `Abaixo estao TODAS as atualizacoes que entraram no sistema na semana (${periodo}).`,
    'Escreva UM resumo consolidado, em portugues do Brasil com acentuacao correta,',
    'do que mudou na semana, de um jeito simples e direto, SEM jargao tecnico',
    '(nada de "endpoint", "trigger", "migration", "RLS", "deploy", "PR" etc.).',
    'Agrupe por tema/area quando fizer sentido e foque no que muda na pratica para o',
    'dia a dia da igreja e das equipes. Use itens de lista curtos (um por mudanca ou tema).',
    'Mudancas puramente tecnicas internas, sem efeito visivel, podem ser resumidas em 1 item geral.',
    'Comece direto pelo resumo, sem saudacao e sem repetir o periodo.',
    '',
    `Total de atualizacoes na semana: ${prs.length}.`,
    '',
    blocos,
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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[resumo-semanal] Erro da Anthropic:', JSON.stringify(data));
      process.exit(1);
    }
    resumo = (data.content || []).map((b) => b.text || '').join('').trim();
  } catch (e) {
    console.error('[resumo-semanal] Falha ao gerar o resumo:', e.message);
    process.exit(1);
  }
  if (!resumo) resumo = 'Resumo indisponivel no momento. Veja a lista de atualizacoes abaixo.';

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
    console.error('[resumo-semanal] Falha na autenticacao do Graph:', e.message);
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

  const listaHtml = prs
    .map(
      (pr) =>
        `<li style="margin:0 0 6px"><a href="${escapeHtml(pr.url)}" style="color:#00B39D">${escapeHtml(pr.title || '')} (#${pr.number})</a></li>`,
    )
    .join('\n');

  const plural = prs.length === 1 ? 'atualização entrou' : 'atualizações entraram';

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:640px">
    <p style="margin:0 0 12px">Olá, Eduardo,</p>
    <p style="margin:0 0 16px">Esta semana (${escapeHtml(periodo)}), ${prs.length} ${plural} no sistema. Em resumo:</p>
    <div style="background:#f4faf9;border-left:4px solid #00B39D;padding:14px 16px;border-radius:6px;margin:0 0 18px">
      ${resumoHtml}
    </div>
    <p style="margin:0 0 6px;color:#555;font-size:13px">Lista das atualizações (detalhes técnicos, para a equipe):</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:13px">
      ${listaHtml}
    </ul>
    <p style="margin:0;color:#999;font-size:12px">Mensagem automática semanal do sistema CBRio.</p>
  </div>`;

  const assunto = `Resumo da semana no sistema CBRio — ${periodo} (${prs.length} ${prs.length === 1 ? 'atualização' : 'atualizações'})`.slice(0, 200);

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
      console.error(`[resumo-semanal] sendMail falhou (HTTP ${res.status}):`, txt);
      process.exit(1);
    }
  } catch (e) {
    console.error('[resumo-semanal] Falha ao enviar o e-mail:', e.message);
    process.exit(1);
  }

  console.log(`[resumo-semanal] E-mail enviado para ${TO} (${prs.length} PRs · ${periodo}).`);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch((e) => {
  console.error('[resumo-semanal] Erro inesperado:', e);
  process.exit(1);
});
