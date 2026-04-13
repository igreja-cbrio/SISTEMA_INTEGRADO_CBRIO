/**
 * Report Generator — gera HTML (apresentação e documento) com identidade CBRio.
 * Templates em backend/templates/slide.html e document.html
 */
const fs = require('fs');
const path = require('path');

function loadTemplate(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'templates', name), 'utf8');
}

function markdownToHtml(md) {
  if (!md) return '';
  return md
    .split('\n')
    .map(line => {
      const t = line.trim();
      if (!t) return '';
      if (t.startsWith('### ')) return `<h4>${t.replace(/^###\s*/, '').replace(/\*\*/g, '')}</h4>`;
      if (t.startsWith('## ')) return `<h3>${t.replace(/^##\s*\d*\.?\s*/, '').replace(/\*\*/g, '')}</h3>`;
      if (t.startsWith('# ')) return `<h2>${t.replace(/^#\s*/, '').replace(/\*\*/g, '')}</h2>`;
      if (t.startsWith('- ') || t.startsWith('* ')) {
        const text = t.replace(/^[-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return `<li>${text}</li>`;
      }
      return `<p>${t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
    })
    .join('\n')
    .replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
      if (!match.startsWith('<ul>')) return `<ul>${match}</ul>`;
      return match;
    });
}

function extractSection(content, title) {
  const regex = new RegExp(`##?\\s*\\d*\\.?\\s*${title}[\\s\\S]*?(?=\\n##[^#]|$)`, 'i');
  const match = content.match(regex);
  if (!match) return '';
  const text = match[0].replace(/^##?\s*\d*\.?\s*[^\n]*\n/, '').trim();
  return markdownToHtml(text);
}

function extractSummary(content) {
  // Pegar Resumo Executivo ou primeiro parágrafo substancial
  const sec = extractSection(content, 'Resumo Executivo') || extractSection(content, 'Resumo');
  if (sec) return sec;
  // Fallback: pegar entregas por área
  return extractSection(content, 'Entregas') || extractSection(content, 'Status');
}

function extractRisks(content) {
  const pontos = extractSection(content, 'Pontos de Atenção') || extractSection(content, 'Pontos');
  const pendentes = extractSection(content, 'Cards Pendentes') || extractSection(content, 'Pendentes');
  let html = '';
  if (pontos) html += pontos;
  if (pendentes) html += pendentes;
  return html || '<p>Nenhum risco ou alerta identificado neste período.</p>';
}

function extractRecommendations(content) {
  return extractSection(content, 'Recomendações') || extractSection(content, 'Próximos') || '<p>Sem recomendações adicionais.</p>';
}

function extractDetailedBody(content) {
  // Remove resumo e riscos pra não duplicar — mantém Entregas, Observações, etc.
  let body = content || '';
  // Remove seções já exibidas separadamente
  ['Resumo Executivo', 'Pontos de Atenção', 'Cards Pendentes', 'Recomendações'].forEach(title => {
    const regex = new RegExp(`##?\\s*\\d*\\.?\\s*${title}[\\s\\S]*?(?=\\n##[^#]|$)`, 'i');
    body = body.replace(regex, '');
  });
  return markdownToHtml(body.trim());
}

function generateSlideHTML({ eventName, eventDate, scope, phases, completedTasks, pendingTasks, totalTasks, pctDone, reportContent }) {
  let html = loadTemplate('slide.html');

  // Barras de progresso das fases
  let phaseBars = '';
  (phases || []).forEach(p => {
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    const color = pct === 100 ? 'var(--g)' : pct > 0 ? 'var(--p)' : '#e5e5e5';
    const pctColor = pct === 100 ? 'var(--g)' : pct > 0 ? 'var(--p)' : '#ccc';
    phaseBars += `
      <div class="prow">
        <div class="pnum">${String(p.numero).padStart(2, '0')}</div>
        <div class="pname">${p.nome}</div>
        <div class="pbar"><div class="pbar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="ppct" style="color:${pctColor}">${pct}%</div>
      </div>`;
  });

  const summary = extractSummary(reportContent || '');
  const highlights = extractRisks(reportContent || '');
  const recommendations = extractRecommendations(reportContent || '');

  html = html
    .replace(/\{\{eventName\}\}/g, eventName || 'Evento')
    .replace(/\{\{eventDate\}\}/g, eventDate || '')
    .replace(/\{\{scope\}\}/g, scope || '')
    .replace(/\{\{totalTasks\}\}/g, String(totalTasks || 0))
    .replace(/\{\{completedTasks\}\}/g, String(completedTasks || 0))
    .replace(/\{\{pendingTasks\}\}/g, String(pendingTasks || 0))
    .replace(/\{\{pctDone\}\}/g, String(pctDone || 0))
    .replace(/\{\{phaseBars\}\}/g, phaseBars)
    .replace(/\{\{summary\}\}/g, summary)
    .replace(/\{\{highlights\}\}/g, highlights)
    .replace(/\{\{recommendations\}\}/g, recommendations)
    .replace(/\{\{generatedAt\}\}/g, new Date().toLocaleString('pt-BR'));

  return html;
}

function generateDocumentHTML({ eventName, eventDate, scope, phases, completedTasks, pendingTasks, totalTasks, pctDone, reportContent, pendingTasksList }) {
  let html = loadTemplate('document.html');

  // Linhas da tabela de progresso
  let phaseRows = '';
  (phases || []).forEach(p => {
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    const color = pct === 100 ? 'var(--g)' : pct > 0 ? 'var(--p)' : '#ddd';
    phaseRows += `
      <tr>
        <td><strong style="color:var(--p)">F${String(p.numero).padStart(2, '0')}</strong> ${p.nome}</td>
        <td>${p.done}/${p.total}</td>
        <td><div class="mbar"><div class="mbar-fill" style="width:${pct}%;background:${color}"></div></div></td>
        <td class="pct" style="color:${color};text-align:right">${pct}%</td>
      </tr>`;
  });

  // Separar conteúdo em seções
  const summaryBody = extractSummary(reportContent || '');
  const risksBody = extractRisks(reportContent || '');
  const reportBody = extractDetailedBody(reportContent || '');

  html = html
    .replace(/\{\{eventName\}\}/g, eventName || 'Evento')
    .replace(/\{\{eventDate\}\}/g, eventDate || '')
    .replace(/\{\{scope\}\}/g, scope || '')
    .replace(/\{\{totalTasks\}\}/g, String(totalTasks || 0))
    .replace(/\{\{completedTasks\}\}/g, String(completedTasks || 0))
    .replace(/\{\{pendingTasks\}\}/g, String(pendingTasks || 0))
    .replace(/\{\{pctDone\}\}/g, String(pctDone || 0))
    .replace(/\{\{phaseRows\}\}/g, phaseRows)
    .replace(/\{\{summaryBody\}\}/g, summaryBody)
    .replace(/\{\{risksBody\}\}/g, risksBody)
    .replace(/\{\{reportBody\}\}/g, reportBody)
    .replace(/\{\{generatedAt\}\}/g, new Date().toLocaleString('pt-BR'));

  return html;
}

module.exports = { generateSlideHTML, generateDocumentHTML };
