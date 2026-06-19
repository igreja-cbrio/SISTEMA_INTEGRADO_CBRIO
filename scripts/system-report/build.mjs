#!/usr/bin/env node
// Gera o dashboard self-contained de CUSTOS + ATIVIDADE DE DESENVOLVIMENTO do
// sistema (docs/system-report/index.html). Roda no GitHub Action (diário +
// manual) pra ficar sempre atualizado.
//
// - Atividade (commits/merges/linhas por pessoa, timeline, % assistido por IA)
//   é REAL, lida do git. Identidades são consolidadas por pessoa.
// - Custos vêm de scripts/system-report/config.json (estimativas editáveis):
//   acumulado desde project_start + projeção de 12 meses, recalculados pela data.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REF = process.env.REPORT_REF || 'HEAD';

// Consolidação de identidades (mesma pessoa commita com nomes/emails diferentes).
const IDENTIDADES = [
  { nome: 'Matheus Toscano', cor: '#00B39D', testa: (a) => /mtoscano99|matheus@cbrio|matheus toscano/i.test(a) },
  { nome: 'Marcos Paulo',    cor: '#8b5cf6', testa: (a) => /marcospaulo1|marcospaulo\.almeida|marcos paulo/i.test(a) },
  { nome: 'Claude (IA)',     cor: '#f59e0b', testa: (a) => /noreply@anthropic|^claude\|/i.test(a) },
];
const canonical = (autor) => (IDENTIDADES.find((i) => i.testa(autor))?.nome) || 'Outros';
const corDe = (nome) => (IDENTIDADES.find((i) => i.nome === nome)?.cor) || '#64748b';

const git = (args) => execSync(`git ${args}`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

// ── Atividade do git ─────────────────────────────────────────────────────────
const totalCommits = Number(git(`rev-list --count ${REF}`).trim());
const totalMerges = Number(git(`rev-list --count --merges ${REF}`).trim());
const iaAssistidos = git(`log ${REF} --grep="Co-Authored-By: Claude" --oneline`).trim().split('\n').filter(Boolean).length;

const datas = git(`log ${REF} --pretty='%ad' --date=short`).trim().split('\n').filter(Boolean);
const primeiroCommit = datas[datas.length - 1] || null;
const ultimoCommit = datas[0] || null;

// Por pessoa: commits (todos), merges
const porPessoa = {};
const add = (nome, campo) => { (porPessoa[nome] ??= { nome, cor: corDe(nome), commits: 0, merges: 0, adicoes: 0, remocoes: 0 }); porPessoa[nome][campo]++; };
for (const a of git(`log ${REF} --pretty='%an|%ae'`).trim().split('\n').filter(Boolean)) add(canonical(a), 'commits');
for (const a of git(`log ${REF} --merges --pretty='%an|%ae'`).trim().split('\n').filter(Boolean)) add(canonical(a), 'merges');

// Linhas adicionadas/removidas por pessoa (exclui merges)
{
  let atual = null;
  for (const linha of git(`log ${REF} --no-merges --pretty='@%an|%ae' --numstat`).split('\n')) {
    if (linha.startsWith('@')) { atual = canonical(linha.slice(1)); continue; }
    const m = linha.match(/^(\d+|-)\t(\d+|-)\t/);
    if (m && atual && porPessoa[atual]) {
      porPessoa[atual].adicoes += m[1] === '-' ? 0 : Number(m[1]);
      porPessoa[atual].remocoes += m[2] === '-' ? 0 : Number(m[2]);
    }
  }
}
const pessoas = Object.values(porPessoa).sort((a, b) => b.commits - a.commits);

// Commits por mês (YYYY-MM)
const porMes = {};
for (const d of datas) { const ym = d.slice(0, 7); porMes[ym] = (porMes[ym] || 0) + 1; }
const timeline = Object.entries(porMes).sort().map(([mes, qtd]) => ({ mes, qtd }));

// ── Custos ───────────────────────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
const fx = Number(cfg.fx_usd_brl) || 1;
const emBRL = (v, moeda) => (moeda === 'USD' ? Number(v) * fx : Number(v));

const inicio = new Date((cfg.project_start || primeiroCommit) + 'T00:00:00Z');
const hoje = new Date();
const diasProjeto = Math.max(1, Math.round((hoje - inicio) / 86400000));
const mesesDecorridos = Math.max(0, (hoje - inicio) / (30.44 * 86400000));

const recorrentes = (cfg.recorrentes_mensais || []).map((r) => ({ nome: r.nome, nota: r.nota || '', mensal_brl: emBRL(r.valor, r.moeda) }));
const pontuais = (cfg.custos_pontuais || []).map((p) => ({ nome: p.nome, nota: p.nota || '', valor_brl: emBRL(p.valor, p.moeda), data: p.data || null }));

const recorrenteMensal = recorrentes.reduce((s, r) => s + r.mensal_brl, 0);
const totalPontuais = pontuais.reduce((s, p) => s + p.valor_brl, 0);
const acumuladoAteHoje = recorrenteMensal * mesesDecorridos + totalPontuais;
const projecao12m = recorrenteMensal * 12 + totalPontuais; // custo do 1º ano de uso

// Série acumulada mês a mês (12 meses a partir do início) + marcador "hoje"
const serieAcumulada = [];
for (let m = 0; m <= 12; m++) {
  serieAcumulada.push({ mes: m, valor: totalPontuais + recorrenteMensal * m });
}

const DATA = {
  gerado_em: hoje.toISOString(),
  ref: REF,
  projeto: { inicio: cfg.project_start || primeiroCommit, primeiro_commit: primeiroCommit, ultimo_commit: ultimoCommit, dias: diasProjeto, meses_decorridos: Number(mesesDecorridos.toFixed(2)) },
  atividade: { total_commits: totalCommits, total_merges: totalMerges, ia_assistidos: iaAssistidos, pessoas, timeline },
  custos: { moeda: 'BRL', fx_usd_brl: fx, recorrente_mensal: recorrenteMensal, total_pontuais: totalPontuais, acumulado_ate_hoje: acumuladoAteHoje, projecao_12m: projecao12m, recorrentes, pontuais, serie_acumulada: serieAcumulada },
};

// ── HTML ─────────────────────────────────────────────────────────────────────
const outDir = join(ROOT, 'docs', 'system-report');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html(DATA));
console.log(`[system-report] gerado · ${totalCommits} commits · acumulado R$ ${acumuladoAteHoje.toFixed(0)} · projeção R$ ${projecao12m.toFixed(0)}`);

function html(D) {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CBRio · Custos & Atividade do Sistema</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root{ --bg:#0b1220; --card:#121a2b; --line:#1f2a44; --txt:#e6edf7; --txt2:#93a3bf; --teal:#00B39D; }
  *{box-sizing:border-box} body{margin:0;background:radial-gradient(1200px 600px at 80% -10%, rgba(0,179,157,.10), transparent),var(--bg);color:var(--txt);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1180px;margin:0 auto;padding:32px 20px 64px}
  h1{font-size:24px;margin:0} .sub{color:var(--txt2);font-size:13px;margin-top:4px}
  .grid{display:grid;gap:16px} .kpis{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:24px 0}
  .card{background:linear-gradient(180deg,rgba(255,255,255,.03),transparent),var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
  .kpi .label{color:var(--txt2);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  .kpi .val{font-size:28px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums}
  .kpi .hint{color:var(--txt2);font-size:12px;margin-top:2px}
  .teal{color:var(--teal)} .row{display:grid;gap:16px;grid-template-columns:1fr 1fr} @media(max-width:820px){.row{grid-template-columns:1fr}}
  .ch{position:relative;height:300px} h2{font-size:15px;margin:0 0 12px} table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
  .badge{display:inline-block;background:rgba(0,179,157,.12);color:var(--teal);border:1px solid rgba(0,179,157,.3);border-radius:999px;padding:2px 10px;font-size:12px}
  .foot{color:var(--txt2);font-size:12px;margin-top:24px} .est{color:#f59e0b}
</style></head><body><div class="wrap">
  <h1>CBRio · Custos & Atividade do Sistema</h1>
  <div class="sub">Sistema Integrado CBRio · início ${D.projeto.inicio} · ${D.projeto.dias} dias de projeto · <span class="badge">atualizado ${new Date(D.gerado_em).toLocaleString('pt-BR')}</span></div>

  <div class="grid kpis">
    <div class="card kpi"><div class="label">Commits</div><div class="val">${D.atividade.total_commits.toLocaleString('pt-BR')}</div><div class="hint">${D.atividade.total_merges.toLocaleString('pt-BR')} merges</div></div>
    <div class="card kpi"><div class="label">Assistido por IA</div><div class="val teal">${pct(D.atividade.ia_assistidos, D.atividade.total_commits)}%</div><div class="hint">${D.atividade.ia_assistidos} de ${D.atividade.total_commits} commits</div></div>
    <div class="card kpi"><div class="label">Custo recorrente</div><div class="val">${brl(D.custos.recorrente_mensal)}</div><div class="hint">por mês <span class="est">(estimativa)</span></div></div>
    <div class="card kpi"><div class="label">Gasto até hoje</div><div class="val">${brl(D.custos.acumulado_ate_hoje)}</div><div class="hint">${D.projeto.meses_decorridos} meses de uso</div></div>
    <div class="card kpi"><div class="label">Projeção 12 meses</div><div class="val teal">${brl(D.custos.projecao_12m)}</div><div class="hint">custo do 1º ano <span class="est">(estimativa)</span></div></div>
  </div>

  <div class="row">
    <div class="card"><h2>Commits por pessoa</h2><div class="ch"><canvas id="cPessoas"></canvas></div></div>
    <div class="card"><h2>Merges por pessoa</h2><div class="ch"><canvas id="cMerges"></canvas></div></div>
  </div>
  <div style="height:16px"></div>
  <div class="row">
    <div class="card"><h2>Atividade por mês (commits)</h2><div class="ch"><canvas id="cTimeline"></canvas></div></div>
    <div class="card"><h2>Custo mensal por serviço <span class="est">(estimativa)</span></h2><div class="ch"><canvas id="cCustos"></canvas></div></div>
  </div>
  <div style="height:16px"></div>
  <div class="card"><h2>Custo acumulado · projeção 12 meses <span class="est">(estimativa)</span></h2><div class="ch" style="height:320px"><canvas id="cProj"></canvas></div></div>

  <div style="height:16px"></div>
  <div class="row">
    <div class="card"><h2>Contribuição por pessoa</h2>
      <table><thead><tr><th>Pessoa</th><th class="n">Commits</th><th class="n">Merges</th><th class="n">+ linhas</th><th class="n">− linhas</th></tr></thead><tbody>
      ${D.atividade.pessoas.map((p) => `<tr><td>${p.nome}</td><td class="n">${p.commits}</td><td class="n">${p.merges}</td><td class="n">${p.adicoes.toLocaleString('pt-BR')}</td><td class="n">${p.remocoes.toLocaleString('pt-BR')}</td></tr>`).join('')}
      </tbody></table></div>
    <div class="card"><h2>Custos recorrentes <span class="est">(estimativa editável)</span></h2>
      <table><thead><tr><th>Serviço</th><th class="n">R$/mês</th></tr></thead><tbody>
      ${D.custos.recorrentes.map((r) => `<tr><td>${r.nome}${r.nota ? `<div style="color:var(--txt2);font-size:11px">${r.nota}</div>` : ''}</td><td class="n">${brl(r.mensal_brl)}</td></tr>`).join('')}
      <tr style="font-weight:700"><td>Total / mês</td><td class="n teal">${brl(D.custos.recorrente_mensal)}</td></tr>
      </tbody></table></div>
  </div>

  <div class="foot">
    Atividade lida automaticamente do histórico git (ref <code>${D.ref}</code>) · identidades consolidadas por pessoa.
    Custos são <span class="est">estimativas editáveis</span> em <code>scripts/system-report/config.json</code> (USD convertido a R$ ${D.custos.fx_usd_brl}/USD).
    Regenerado pela GitHub Action <code>system-report</code>.
  </div>
</div>
<script>
const D = ${JSON.stringify(D)};
const teal='#00B39D', grid='rgba(255,255,255,.06)', txt='#93a3bf';
Chart.defaults.color = txt; Chart.defaults.borderColor = grid; Chart.defaults.font.family='ui-sans-serif,system-ui,sans-serif';
const money = v => 'R$ ' + Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const cores = D.atividade.pessoas.map(p=>p.cor);

new Chart(cPessoas,{type:'doughnut',data:{labels:D.atividade.pessoas.map(p=>p.nome),datasets:[{data:D.atividade.pessoas.map(p=>p.commits),backgroundColor:cores,borderWidth:0}]},options:{plugins:{legend:{position:'bottom'}},cutout:'58%'}});
new Chart(cMerges,{type:'bar',data:{labels:D.atividade.pessoas.map(p=>p.nome),datasets:[{label:'Merges',data:D.atividade.pessoas.map(p=>p.merges),backgroundColor:cores,borderRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:grid}},x:{grid:{display:false}}}}});
new Chart(cTimeline,{type:'bar',data:{labels:D.atividade.timeline.map(t=>t.mes),datasets:[{label:'Commits',data:D.atividade.timeline.map(t=>t.qtd),backgroundColor:teal,borderRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:grid}},x:{grid:{display:false}}}}});
new Chart(cCustos,{type:'doughnut',data:{labels:D.custos.recorrentes.map(r=>r.nome),datasets:[{data:D.custos.recorrentes.map(r=>r.mensal_brl),backgroundColor:['#00B39D','#8b5cf6','#f59e0b','#3b82f6','#ec4899','#10b981','#ef4444','#06b6d4'],borderWidth:0}]},options:{plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>c.label+': '+money(c.raw)}}},cutout:'58%'}});
const mesesDec = D.projeto.meses_decorridos;
// Divide a curva em "realizado" (até hoje) e "projetado" (restante do 1º ano)
const real = D.custos.serie_acumulada.map(s => s.mes <= mesesDec ? s.valor : null);
const proj = D.custos.serie_acumulada.map(s => s.mes >= Math.floor(mesesDec) ? s.valor : null);
new Chart(cProj,{type:'line',data:{labels:D.custos.serie_acumulada.map(s=>'Mês '+s.mes),datasets:[
  {label:'Realizado',data:real,borderColor:teal,backgroundColor:'rgba(0,179,157,.14)',fill:true,tension:.25,pointRadius:2},
  {label:'Projetado',data:proj,borderColor:'#f59e0b',borderDash:[6,4],fill:false,tension:.25,pointRadius:0},
]},options:{plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>c.dataset.label+': '+money(c.raw)}}},scales:{y:{beginAtZero:true,grid:{color:grid},ticks:{callback:v=>money(v)}},x:{grid:{display:false}}}}});
</script></body></html>`;
}

function brl(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
