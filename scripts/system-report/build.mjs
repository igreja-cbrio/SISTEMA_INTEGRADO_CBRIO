#!/usr/bin/env node
// Gera o dashboard self-contained de CUSTOS + ATIVIDADE DE DESENVOLVIMENTO do
// sistema (docs/system-report/index.html), pronto pra publicar no GitHub Pages.
// Roda no GitHub Action (diário + a cada push na main + manual) pra ficar sempre
// atualizado.
//
// - Atividade (commits/merges por pessoa, timeline, % assistido por IA) é REAL,
//   lida do git. Identidades consolidadas por pessoa.
// - Custos vêm de scripts/system-report/config.json (estimativas editáveis):
//   acumulado desde project_start + projeção de 12 meses, recalculados na página.
// - O HTML vem de scripts/system-report/template.html (placeholders __SNAPSHOT__
//   e __COSTS__), assim a página também atualiza ao vivo no navegador.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REF = process.env.REPORT_REF || 'HEAD';

// Consolidação de identidades (mesma pessoa commita com nomes/emails diferentes).
const IDENTIDADES = [
  { nome: 'Matheus Toscano', testa: (a) => /mtoscano99|matheus@cbrio|matheus toscano/i.test(a) },
  { nome: 'Marcos Paulo',    testa: (a) => /marcospaulo1|marcospaulo\.almeida|marcos paulo/i.test(a) },
  { nome: 'Claude (IA)',     testa: (a) => /noreply@anthropic|claudebot|claude\.ai|^claude\b|\[bot\]|github-actions/i.test(a) },
];
const canonical = (autor) => (IDENTIDADES.find((i) => i.testa(autor))?.nome) || 'Outros';
const corDe = (nome) => ({ 'Matheus Toscano':'#00B39D', 'Marcos Paulo':'#8b5cf6', 'Claude (IA)':'#f59e0b' }[nome] || '#64748b');

const git = (args) => execSync(`git ${args}`, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString();

// ── Atividade do git ─────────────────────────────────────────────────────────
const total = Number(git(`rev-list --count ${REF}`).trim());
const merges = Number(git(`rev-list --count --merges ${REF}`).trim());
const ia = git(`log ${REF} --grep="Co-Authored-By: Claude" --oneline`).trim().split('\n').filter(Boolean).length;

const datas = git(`log ${REF} --pretty="%ad" --date=short`).trim().split('\n').filter(Boolean);
const primeiro = datas[datas.length - 1] || null;
const ultimo = datas[0] || null;

const P = {};
const add = (nome, campo) => { (P[nome] ??= { nome, cor: corDe(nome), commits: 0, merges: 0 }); P[nome][campo]++; };
for (const a of git(`log ${REF} --pretty="%an|%ae"`).trim().split('\n').filter(Boolean)) add(canonical(a), 'commits');
for (const a of git(`log ${REF} --merges --pretty="%an|%ae"`).trim().split('\n').filter(Boolean)) add(canonical(a), 'merges');
const pessoas = Object.values(P).sort((a, b) => b.commits - a.commits);

const mes = {};
for (const d of datas) { const ym = d.slice(0, 7); mes[ym] = (mes[ym] || 0) + 1; }
const timeline = Object.entries(mes).sort().map(([m, q]) => ({ mes: m, qtd: q }));

const SNAPSHOT = { gerado_em: new Date().toISOString(), total, merges, ia, primeiro, ultimo, pessoas, timeline };

// ── Custos (config editável) ─────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
const COSTS = {
  project_start: cfg.project_start,
  fx: Number(cfg.fx_usd_brl) || 1,
  recorrentes: (cfg.recorrentes_mensais || []).map((r) => ({ nome: r.nome, valor: r.valor, moeda: r.moeda })),
  pontuais: (cfg.custos_pontuais || []).map((p) => ({ nome: p.nome, valor: p.valor, moeda: p.moeda })),
};

// ── Render (injeta os dados no template) ─────────────────────────────────────
const tpl = readFileSync(join(__dirname, 'template.html'), 'utf8');
const html = tpl
  .replace('__SNAPSHOT__', () => JSON.stringify(SNAPSHOT))
  .replace('__COSTS__', () => JSON.stringify(COSTS));

const outDir = join(ROOT, 'docs', 'system-report');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, '.nojekyll'), '');
console.log(`[system-report] gerado · ${total} commits · ${merges} merges · ${ia} assistidos por IA`);
