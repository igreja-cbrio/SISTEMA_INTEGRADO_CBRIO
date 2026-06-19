#!/usr/bin/env node
// Gera o dashboard self-contained de CUSTOS + ATIVIDADE DE DESENVOLVIMENTO do
// sistema (docs/system-report/index.html), pronto pra publicar no GitHub Pages.
// Roda no GitHub Action (diário + a cada push na main + manual).
//
// - Commits/timeline/% IA por pessoa: REAL, lido do git.
// - PRs integrados (merged): fonte OFICIAL do GitHub (Search API) — bate com o
//   que aparece no GitHub. NÃO é a contagem de merge commits (squash não conta).
// - Custos: scripts/system-report/config.json (estimativas editáveis).
// - HTML: scripts/system-report/template.html (placeholders __SNAPSHOT__/__COSTS__).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REF = process.env.REPORT_REF || 'HEAD';
const MAIN_REPO = 'igreja-cbrio/SISTEMA_INTEGRADO_CBRIO';

const IDENTIDADES = [
  { nome: 'Matheus Toscano', login: 'mtoscano99',  testa: (a) => /mtoscano99|matheus@cbrio|matheus toscano/i.test(a) },
  { nome: 'Marcos Paulo',    login: 'MarcosPaulo1', testa: (a) => /marcospaulo1|marcospaulo\.almeida|marcos paulo/i.test(a) },
  { nome: 'Claude (IA)',     login: null,           testa: (a) => /noreply@anthropic|claudebot|claude\.ai|^claude\b|\[bot\]|github-actions/i.test(a) },
];
const canonical = (autor) => (IDENTIDADES.find((i) => i.testa(autor))?.nome) || 'Outros';
const corDe = (nome) => ({ 'Matheus Toscano':'#408097', 'Marcos Paulo':'#70a8b0', 'Claude (IA)':'#c89b6a' }[nome] || '#aab9c0');

const git = (args) => execSync(`git ${args}`, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString();

// ── Atividade do git (commits) ───────────────────────────────────────────────
const total = Number(git(`rev-list --count ${REF}`).trim());
const merges = Number(git(`rev-list --count --merges ${REF}`).trim());
const ia = git(`log ${REF} --grep="Co-Authored-By: Claude" --oneline`).trim().split('\n').filter(Boolean).length;
const datas = git(`log ${REF} --pretty="%ad" --date=short`).trim().split('\n').filter(Boolean);
const primeiro = datas[datas.length - 1] || null;
const ultimo = datas[0] || null;

const P = {};
const add = (nome, campo) => { (P[nome] ??= { nome, cor: corDe(nome), commits: 0, merges: 0, prs: 0 }); P[nome][campo]++; };
for (const a of git(`log ${REF} --pretty="%an|%ae"`).trim().split('\n').filter(Boolean)) add(canonical(a), 'commits');
for (const a of git(`log ${REF} --merges --pretty="%an|%ae"`).trim().split('\n').filter(Boolean)) add(canonical(a), 'merges');
const pessoas = Object.values(P).sort((a, b) => b.commits - a.commits);

const mes = {};
for (const d of datas) { const ym = d.slice(0, 7); mes[ym] = (mes[ym] || 0) + 1; }
const timeline = Object.entries(mes).sort().map(([m, q]) => ({ mes: m, qtd: q }));

// ── PRs integrados (merged) · fonte oficial GitHub Search API ─────────────────
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const ghHeaders = { Accept: 'application/vnd.github+json', 'User-Agent': 'cbrio-system-report', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
async function ghCount(q) {
  const r = await fetch('https://api.github.com/search/issues?q=' + encodeURIComponent(q) + '&per_page=1', { headers: ghHeaders });
  if (!r.ok) throw new Error('search HTTP ' + r.status);
  return (await r.json()).total_count ?? 0;
}
let prsMerged = null;
try {
  prsMerged = await ghCount(`repo:${MAIN_REPO} is:pr is:merged`);
  for (const ident of IDENTIDADES) {
    if (!ident.login) continue;
    const n = await ghCount(`repo:${MAIN_REPO} is:pr is:merged author:${ident.login}`);
    const pessoa = pessoas.find((p) => p.nome === ident.nome);
    if (pessoa) pessoa.prs = n;
  }
  console.log(`[system-report] PRs integrados (merged) = ${prsMerged}`);
} catch (e) {
  console.error('[system-report] busca de PRs falhou (segue sem):', e.message);
}

const SNAPSHOT = { gerado_em: new Date().toISOString(), total, merges, ia, prs_merged: prsMerged, primeiro, ultimo, pessoas, timeline };

// ── Custos ───────────────────────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
const COSTS = {
  project_start: cfg.project_start,
  fx: Number(cfg.fx_usd_brl) || 1,
  recorrentes: (cfg.recorrentes_mensais || []).map((r) => ({ nome: r.nome, valor: r.valor, moeda: r.moeda })),
  pontuais: (cfg.custos_pontuais || []).map((p) => ({ nome: p.nome, valor: p.valor, moeda: p.moeda })),
};

// ── Render ───────────────────────────────────────────────────────────────────
const tpl = readFileSync(join(__dirname, 'template.html'), 'utf8');
const html = tpl.replace('__SNAPSHOT__', () => JSON.stringify(SNAPSHOT)).replace('__COSTS__', () => JSON.stringify(COSTS));

const outDir = join(ROOT, 'docs', 'system-report');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, '.nojekyll'), '');
console.log(`[system-report] gerado · ${total} commits · ${prsMerged ?? '?'} PRs integrados · ${ia} assistidos por IA`);
