/**
 * Export utilities for CRM CBRio
 */

export function exportCSV(headers, rows, filename = 'export') {
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${dateStr()}.csv`);
}

export function exportPDF(title, headers, rows, options = {}) {
  const { subtitle, footer } = options;
  const now = new Date().toLocaleString('pt-BR');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Inter,sans-serif;padding:40px}h1{font-size:18px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:12px}
th{background:#f5f5f5;font-weight:600}
.footer{margin-top:24px;font-size:11px;color:#888}</style></head>
<body><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>
<div class="footer">${rows.length} registro(s) — Gerado em ${now}${footer ? ` — ${footer}` : ''}</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function dateStr() {
  return new Date().toISOString().slice(0, 10);
}
