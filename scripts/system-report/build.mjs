#!/usr/bin/env node
// Gera o dashboard self-contained de CUSTOS + ATIVIDADE + CRONOGRAMA do sistema
// (docs/system-report/index.html), pronto pra publicar no GitHub Pages.
// Roda no GitHub Action (diário + a cada push na main + manual).
//
// - Commits/timeline/% IA por pessoa: REAL, do git.
// - PRs integrados (merged): fonte oficial do GitHub (Search API).
// - Cronograma: % e status calculados AUTOMATICAMENTE por atividade no git
//   (frente estabilizada -> ~100%; muito trabalho recente -> "em andamento").
// - Custos: scripts/system-report/config.json.
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
const ia = git(`log ${REF} --grep="Co-Authored-By: Claude" --oneline`).trim().split('\n').filter(Boolean).length;
const datas = git(`log ${REF} --pretty="%ad" --date=short`).trim().split('\n').filter(Boolean);
const primeiro = datas[datas.length - 1] || null;
const ultimo = datas[0] || null;

const P = {};
const add = (nome) => { (P[nome] ??= { nome, cor: corDe(nome), commits: 0, prs: 0 }); P[nome].commits++; };
for (const a of git(`log ${REF} --pretty="%an|%ae"`).trim().split('\n').filter(Boolean)) add(canonical(a));
const pessoas = Object.values(P).sort((a, b) => b.commits - a.commits);

const mes = {};
for (const d of datas) { const ym = d.slice(0, 7); mes[ym] = (mes[ym] || 0) + 1; }
const timeline = Object.entries(mes).sort().map(([m, q]) => ({ mes: m, qtd: q }));

// ── PRs integrados (merged) · GitHub Search API ──────────────────────────────
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
} catch (e) { console.error('[system-report] busca de PRs falhou:', e.message); }

// Resiliência: se a busca falhou (ex.: rate limit), reaproveita o último valor
// conhecido do index.html já publicado — nunca zera os PRs por falha transitória.
if (prsMerged == null) {
  try {
    const m = readFileSync(join(ROOT, 'docs', 'system-report', 'index.html'), 'utf8').match(/const SNAPSHOT = (\{.*?\});/);
    const old = m && JSON.parse(m[1]);
    if (old && old.prs_merged != null) {
      prsMerged = old.prs_merged;
      const byName = Object.fromEntries((old.pessoas || []).map((p) => [p.nome, p.prs]));
      pessoas.forEach((p) => { if (byName[p.nome] != null) p.prs = byName[p.nome]; });
      console.log('[system-report] PRs reaproveitados do build anterior:', prsMerged);
    }
  } catch {}
}

// ── Cronograma · % e status AUTOMÁTICOS por atividade no git ─────────────────
// Cada frente -> arquivos reais. % = quanto do trabalho da frente já está
// estabilizado: commits recentes (30d) em relação ao total. Frente estável
// (pouco/nada recente) -> ~100% (concluída); muito trabalho recente -> "em andamento".
const FRENTES = [
  { nome:'OKR / NSM — painel, matriz, ~150 KPIs', cat:'Estratégia', paths:['backend/routes/painel.js','backend/routes/painelArea.js','backend/routes/nsm.js','backend/routes/estrategia.js','backend/routes/jornada.js','backend/routes/kpis.js','backend/routes/kpisV2.js','backend/routes/dadosBrutos.js','backend/routes/gestao.js','backend/routes/ritual.js','backend/services/kpiAutoCollector.js'] },
  { nome:'Integração — cultos, decisões, batismos', cat:'Ministerial', paths:['backend/routes/integracao.js','backend/routes/publicDecisaoOnline.js'] },
  { nome:'Cuidados — jornada do convertido (90d)', cat:'Ministerial', paths:['backend/routes/cuidados.js','backend/routes/encaminhamentos.js'] },
  { nome:'Grupos de conexão', cat:'Ministerial', paths:['backend/routes/grupos.js','backend/routes/publicGrupos.js','backend/routes/whatsappGrupos.js','backend/services/whatsappGrupos.js'] },
  { nome:'Voluntariado', cat:'Ministerial', paths:['backend/routes/voluntariado.js','backend/routes/voluntariado-sync.js','backend/routes/publicVoluntariado.js','backend/services/voluntariadoSync.js','backend/services/volCheckinResolver.js'] },
  { nome:'Membresia', cat:'Ministerial', paths:['backend/routes/membresia.js','backend/routes/publicMembresia.js'] },
  { nome:'Solicitações — backbone administrativo', cat:'Operacional', paths:['backend/routes/solicitacoes.js','backend/services/solicitacoesMlTracker.js'] },
  { nome:'Cérebro CBRio — IA documental', cat:'IA & Automação', paths:['backend/routes/cerebro.js','backend/services/cerebroProcessor.js','backend/services/cerebroSync.js','backend/services/cerebroDetector.js','backend/services/cerebroSearch.js','backend/services/textExtractor.js'] },
  { nome:'Marketing — kanban, planner', cat:'Operacional', paths:['backend/routes/marketing.js','backend/services/sharepointMarketing.js'] },
  { nome:'Online / YouTube', cat:'Ministerial', paths:['backend/routes/online.js','backend/services/onlineCollectors.js','backend/services/youtubeCollector.js','backend/services/youtubeAnalytics.js'] },
  { nome:'Devocionais', cat:'Ministerial', paths:['backend/routes/devocionais.js','backend/routes/devocionalMembro.js','backend/routes/devocionalPlanos.js','backend/routes/publicDevocional.js','backend/routes/bible.js','backend/services/devocionalSender.js'] },
  { nome:'Governança / Planejamento Estratégico', cat:'Estratégia', paths:['backend/routes/governanca.js','backend/routes/expansion.js','backend/routes/revisoes.js','backend/routes/planejamento.js','backend/routes/strategic.js'] },
  { nome:'Eventos & Projetos — ciclo criativo', cat:'Operacional', paths:['backend/routes/events.js','backend/routes/projects.js','backend/routes/cycles.js','backend/routes/tasks.js'] },
  { nome:'Logística / Compras — scan de NF', cat:'Operacional', paths:['backend/routes/logistica.js','backend/services/comprasImporter.js','backend/services/comprasMatch.js','backend/services/comprasShared.js','backend/services/nfScanner.js','backend/services/fornecedorEnriquecer.js'] },
  { nome:'Financeiro + Agente Executor (IA)', cat:'IA & Automação', paths:['backend/routes/financeiro.js','backend/routes/financeiroV2.js','backend/routes/agents.js','backend/routes/santander.js','backend/routes/santanderCron.js','backend/services/agentService.js','backend/services/financeiroClassificador.js','backend/services/balancoImporter.js','backend/services/ofxParser.js','agent-worker'] },
  { nome:'Bot WhatsApp', cat:'IA & Automação', paths:['backend/routes/publicWhatsapp.js','backend/routes/whatsapp.js','backend/routes/whatsappAutoRoutes.js','backend/services/whatsappParser.js','backend/services/whatsappFlowColeta.js','backend/services/whatsappNota.js','backend/services/whatsappService.js'] },
  { nome:'Totem Kids — check-in infantil', cat:'Ministerial', paths:['backend/routes/totemKids.js','pager-bridge'] },
  { nome:'App de membros', cat:'App', paths:['backend/routes/app.js','backend/routes/appAnalytics.js','backend/routes/comunicados.js','backend/services/webpush.js','backend/services/appleWallet.js'] },
  { nome:'RH & Patrimônio', cat:'Operacional', paths:['backend/routes/rh.js','backend/routes/patrimonio.js','backend/routes/pcs.js'] },
  { nome:'Segurança & Permissões (RLS)', cat:'Infra & Segurança', paths:['backend/middleware/auth.js','backend/routes/permissoes.js','backend/routes/lgpd.js'] },
];
const qp = (p) => `'${p}'`;
function statsFrente(paths) {
  const ps = paths.map(qp).join(' ');
  const ds = git(`log ${REF} --no-merges --format=%ad --date=short -- ${ps}`).trim().split('\n').filter(Boolean);
  const commits = ds.length;
  if (!commits) return { commits: 0, ini: null, fim: null, pct: null, status: 'wait' };
  const recentes = Number(git(`rev-list --count ${REF} --no-merges --since="30 days ago" -- ${ps}`).trim()) || 0;
  const frescor = recentes / commits;                       // 0 = maduro, 1 = tudo recente
  const pct = Math.max(55, Math.min(100, Math.round(100 - 45 * frescor)));
  return { commits, ini: ds[ds.length - 1].slice(0, 7), fim: ds[0].slice(0, 7), pct, status: pct >= 90 ? 'done' : 'prog' };
}
const cronograma = FRENTES.map((f) => ({ nome: f.nome, cat: f.cat, ...statsFrente(f.paths) }))
  .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

const SNAPSHOT = { gerado_em: new Date().toISOString(), total, ia, prs_merged: prsMerged, primeiro, ultimo, pessoas, timeline, cronograma };

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
console.log(`[system-report] gerado · ${total} commits · ${prsMerged ?? '?'} PRs · ${ia} IA · ${cronograma.length} frentes`);
