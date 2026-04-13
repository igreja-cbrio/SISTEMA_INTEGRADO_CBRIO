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

function generateSlideHTML({ eventName, eventDate, scope, phases, completedTasks, pendingTasks, totalTasks, pctDone, reportContent }) {
  let html = loadTemplate('slide.html');

  // Barras de progresso das fases
  let phaseBars = '';
  (phases || []).forEach(p => {
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    const color = pct === 100 ? 'var(--green)' : pct > 0 ? 'var(--primary)' : 'var(--offwhite)';
    phaseBars += `
      <div class="phase-row">
        <div class="phase-name">F${String(p.numero).padStart(2, '0')} ${p.nome}</div>
        <div class="phase-bar"><div class="phase-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="phase-pct">${pct}%</div>
      </div>`;
  });

  const highlights = extractSection(reportContent || '', 'Pontos de Atenção') || '<p>Nenhum ponto de atenção identificado.</p>';
  const recommendations = extractSection(reportContent || '', 'Recomendações') || extractSection(reportContent || '', 'Próximos') || '<p>Sem recomendações adicionais.</p>';

  html = html
    .replace(/\{\{eventName\}\}/g, eventName || 'Evento')
    .replace(/\{\{eventDate\}\}/g, eventDate || '')
    .replace(/\{\{scope\}\}/g, scope || '')
    .replace(/\{\{totalTasks\}\}/g, String(totalTasks || 0))
    .replace(/\{\{completedTasks\}\}/g, String(completedTasks || 0))
    .replace(/\{\{pendingTasks\}\}/g, String(pendingTasks || 0))
    .replace(/\{\{pctDone\}\}/g, String(pctDone || 0))
    .replace(/\{\{phaseBars\}\}/g, phaseBars)
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
    const color = pct === 100 ? 'var(--green)' : pct > 0 ? 'var(--primary)' : '#ddd';
    phaseRows += `
      <tr>
        <td>F${String(p.numero).padStart(2, '0')} ${p.nome}</td>
        <td>${p.done}/${p.total}</td>
        <td class="bar-cell"><div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%;background:${color}"></div></div></td>
        <td class="pct-done" style="color:${color}">${pct}%</td>
      </tr>`;
  });

  // Corpo do relatório (markdown → HTML)
  const reportBody = markdownToHtml(reportContent || '');

  html = html
    .replace(/\{\{eventName\}\}/g, eventName || 'Evento')
    .replace(/\{\{eventDate\}\}/g, eventDate || '')
    .replace(/\{\{scope\}\}/g, scope || '')
    .replace(/\{\{totalTasks\}\}/g, String(totalTasks || 0))
    .replace(/\{\{completedTasks\}\}/g, String(completedTasks || 0))
    .replace(/\{\{pendingTasks\}\}/g, String(pendingTasks || 0))
    .replace(/\{\{pctDone\}\}/g, String(pctDone || 0))
    .replace(/\{\{phaseRows\}\}/g, phaseRows)
    .replace(/\{\{reportBody\}\}/g, reportBody)
    .replace(/\{\{generatedAt\}\}/g, new Date().toLocaleString('pt-BR'));

  return html;
}

module.exports = { generateSlideHTML, generateDocumentHTML };
