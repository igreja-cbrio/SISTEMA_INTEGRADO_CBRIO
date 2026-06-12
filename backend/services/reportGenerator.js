/**
 * Report Generator — gera HTML (apresentação e documento) com identidade CBRio.
 * Templates em backend/templates/slide.html e document.html
 *
 * Estratégia:
 * - Quando `sections` (JSON estruturado vindo de event_reports.sections) é
 *   passado, usa cada campo direto no slot correto. Sem regex.
 * - Quando só `reportContent` (markdown) é passado, usa parser regex como
 *   fallback (compat com relatórios antigos pré-tool_use).
 *
 * Bug corrigido: antes o template tinha cabeçalhos `<h3>` hardcoded E o
 * markdown gerado pelo Haiku também tinha `## Título`. markdownToHtml virava
 * `<h3>` e o resultado era título duplicado em "Progresso por Fase",
 * "Entregas por Área" e "Observações dos Responsáveis". Agora cada campo
 * tem seu `## Título` strippado antes da renderização.
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

// Remove um cabeçalho `## ...` (até 2 hashtags, com ou sem número/negrito) na
// primeira linha do markdown se o título bater com `expectedTitle`. Evita
// duplicação com o cabeçalho hardcoded do template.
function stripLeadingTitle(md, expectedTitle) {
  if (!md) return '';
  const trimmed = md.trimStart();
  const lines = trimmed.split('\n');
  const first = lines[0]?.trim() || '';
  // Aceita "## Título", "# Título", "## **Título**", "## 1. Título"
  const normalized = first
    .replace(/^#{1,3}\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^\*\*(.+?)\*\*$/, '$1')
    .trim()
    .toLowerCase();
  const target = (expectedTitle || '').trim().toLowerCase();
  if (first.startsWith('#') && (normalized === target || normalized.includes(target))) {
    return lines.slice(1).join('\n').trimStart();
  }
  return md;
}

// Renderiza um campo de seção pro HTML, removendo o cabeçalho duplicado.
// Aceita string vazia — devolve placeholder vazio (template renderiza vazio).
function renderSection(sectionContent, expectedTitle, emptyPlaceholder = '') {
  const stripped = stripLeadingTitle(sectionContent || '', expectedTitle);
  if (!stripped.trim()) return emptyPlaceholder;
  return markdownToHtml(stripped);
}

// ─── PARSER REGEX (fallback pra relatórios sem `sections` estruturado) ───

function extractSection(content, title) {
  const regex = new RegExp(`##?\\s*\\d*\\.?\\s*${title}[\\s\\S]*?(?=\\n##[^#]|$)`, 'i');
  const match = content.match(regex);
  if (!match) return '';
  const text = match[0].replace(/^##?\s*\d*\.?\s*[^\n]*\n/, '').trim();
  return markdownToHtml(text);
}

function extractSummary(content) {
  const sec = extractSection(content, 'Resumo Executivo') || extractSection(content, 'Resumo');
  if (sec) return sec;
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

function extractDetailedBody(content) {
  let body = content || '';
  ['Resumo Executivo', 'Pontos de Atenção', 'Cards Pendentes', 'Recomendações'].forEach(title => {
    const regex = new RegExp(`##?\\s*\\d*\\.?\\s*${title}[\\s\\S]*?(?=\\n##[^#]|$)`, 'i');
    body = body.replace(regex, '');
  });
  return markdownToHtml(body.trim());
}

// ─── Resolvers: produzem o HTML de cada slot do template ───────────────
//
// Quando `sections` é JSON estruturado (event_reports.sections), usa direto.
// Senão cai no parser regex sobre `reportContent` (markdown legado).

function resolveSlots({ sections, reportContent }) {
  const hasSections = sections && typeof sections === 'object' && Object.keys(sections).length > 0;

  if (hasSections) {
    // PATH NOVO: cada campo do JSON vai no slot certo, sem regex.
    return {
      summaryBody: renderSection(sections.resumo_executivo, 'Resumo Executivo',
        '<p><em>Resumo não foi gerado para este relatório.</em></p>'),
      // risksBody mantém compatibilidade visual: junta Pontos de Atenção + Cards Pendentes
      risksBody: (
        renderSection(sections.pontos_atencao, 'Pontos de Atenção', '') +
        renderSection(sections.cards_pendentes, 'Cards Pendentes', '')
      ) || '<p>Nenhum risco ou alerta identificado neste período.</p>',
      // Análise Detalhada agrupa as seções restantes, COM seus próprios subtítulos
      // (mas só renderizamos o conteúdo — o sub-h3 vem da seção structured).
      reportBody: buildDetailedBodyFromSections(sections),
    };
  }

  // PATH ANTIGO: parser regex sobre markdown legado
  return {
    summaryBody: extractSummary(reportContent || ''),
    risksBody: extractRisks(reportContent || ''),
    reportBody: extractDetailedBody(reportContent || ''),
  };
}

// Constrói o body da "Análise Detalhada" a partir das seções estruturadas.
// Cada subseção tem seu cabeçalho explícito (1x, não duplicado).
function buildDetailedBodyFromSections(sections) {
  const parts = [];
  const addSubsection = (title, body) => {
    if (!body || !body.trim()) return;
    const stripped = stripLeadingTitle(body, title);
    if (!stripped.trim()) return;
    parts.push(`<h3>${title}</h3>\n${markdownToHtml(stripped)}`);
  };
  // Resumo executivo já está em summaryBody (não duplica aqui)
  // Riscos+Pendentes já estão em risksBody (não duplica)
  // Recomendações vão pro slot dedicado (não entra aqui)
  addSubsection('Entregas por Área', sections.entregas_por_area);
  addSubsection('Observações dos Responsáveis', sections.observacoes_responsaveis);
  // Recomendações vai pra Análise Detalhada também (não tem slot próprio no template doc)
  addSubsection('Recomendações', sections.recomendacoes);
  return parts.join('\n\n') || '<p><em>Sem detalhes adicionais.</em></p>';
}

// ─── Tabela/barras de progresso (sempre determinísticas, vêm de phases[]) ───

function buildPhaseRows(phases) {
  let rows = '';
  (phases || []).forEach(p => {
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    const color = pct === 100 ? 'var(--g)' : pct > 0 ? 'var(--p)' : '#ddd';
    rows += `
      <tr>
        <td><strong style="color:var(--p)">F${String(p.numero).padStart(2, '0')}</strong> ${p.nome}</td>
        <td>${p.done}/${p.total}</td>
        <td><div class="mbar"><div class="mbar-fill" style="width:${pct}%;background:${color}"></div></div></td>
        <td class="pct" style="color:${color};text-align:right">${pct}%</td>
      </tr>`;
  });
  return rows;
}

function buildPhaseBars(phases) {
  let bars = '';
  (phases || []).forEach(p => {
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    const color = pct === 100 ? 'var(--g)' : pct > 0 ? 'var(--p)' : '#e5e5e5';
    const pctColor = pct === 100 ? 'var(--g)' : pct > 0 ? 'var(--p)' : '#ccc';
    bars += `
      <div class="prow">
        <div class="pnum">${String(p.numero).padStart(2, '0')}</div>
        <div class="pname">${p.nome}</div>
        <div class="pbar"><div class="pbar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="ppct" style="color:${pctColor}">${pct}%</div>
      </div>`;
  });
  return bars;
}

// ─── Public API ────────────────────────────────────────────────────────

function generateSlideHTML({ eventName, eventDate, scope, phases, completedTasks, pendingTasks, totalTasks, pctDone, reportContent, sections }) {
  let html = loadTemplate('slide.html');
  const slots = resolveSlots({ sections, reportContent });

  const recommendations = sections && sections.recomendacoes
    ? renderSection(sections.recomendacoes, 'Recomendações', '<p>Sem recomendações adicionais.</p>')
    : (extractSection(reportContent || '', 'Recomendações') || extractSection(reportContent || '', 'Próximos') || '<p>Sem recomendações adicionais.</p>');

  html = html
    .replace(/\{\{eventName\}\}/g, eventName || 'Evento')
    .replace(/\{\{eventDate\}\}/g, eventDate || '')
    .replace(/\{\{scope\}\}/g, scope || '')
    .replace(/\{\{totalTasks\}\}/g, String(totalTasks || 0))
    .replace(/\{\{completedTasks\}\}/g, String(completedTasks || 0))
    .replace(/\{\{pendingTasks\}\}/g, String(pendingTasks || 0))
    .replace(/\{\{pctDone\}\}/g, String(pctDone || 0))
    .replace(/\{\{phaseBars\}\}/g, buildPhaseBars(phases))
    .replace(/\{\{summary\}\}/g, slots.summaryBody)
    .replace(/\{\{highlights\}\}/g, slots.risksBody)
    .replace(/\{\{recommendations\}\}/g, recommendations)
    .replace(/\{\{generatedAt\}\}/g, new Date().toLocaleString('pt-BR'));

  return html;
}

function generateDocumentHTML({ eventName, eventDate, scope, phases, completedTasks, pendingTasks, totalTasks, pctDone, reportContent, sections }) {
  let html = loadTemplate('document.html');
  const slots = resolveSlots({ sections, reportContent });

  html = html
    .replace(/\{\{eventName\}\}/g, eventName || 'Evento')
    .replace(/\{\{eventDate\}\}/g, eventDate || '')
    .replace(/\{\{scope\}\}/g, scope || '')
    .replace(/\{\{totalTasks\}\}/g, String(totalTasks || 0))
    .replace(/\{\{completedTasks\}\}/g, String(completedTasks || 0))
    .replace(/\{\{pendingTasks\}\}/g, String(pendingTasks || 0))
    .replace(/\{\{pctDone\}\}/g, String(pctDone || 0))
    .replace(/\{\{phaseRows\}\}/g, buildPhaseRows(phases))
    .replace(/\{\{summaryBody\}\}/g, slots.summaryBody)
    .replace(/\{\{risksBody\}\}/g, slots.risksBody)
    .replace(/\{\{reportBody\}\}/g, slots.reportBody)
    .replace(/\{\{generatedAt\}\}/g, new Date().toLocaleString('pt-BR'));

  return html;
}

module.exports = { generateSlideHTML, generateDocumentHTML };
