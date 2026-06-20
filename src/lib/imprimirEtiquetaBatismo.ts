// Impressão da etiqueta de batismo · Quiosque Fase 1.
// Modelada na etiqueta do Totem Kids (src/pages/ministerial/totemKids/lib/imprimir.ts),
// mas: QR (token forte de acesso às fotos) + código curto legível (conferência),
// 1 etiqueta só. Brother QL · 90×29mm · window.print() via iframe oculto.
//
// Pré-requisito (setup do totem · uma vez): Brother instalada como impressora
// padrão do Windows + navegador em modo kiosk ("imprimir sem diálogo").

export interface DadosEtiquetaBatismo {
  nome: string;
  codigoConferencia: string;  // legível, só conferência humana
  qrUrl: string;              // o QR codifica esta URL (/batismo/acesso?token=...)
  dataLabel?: string;         // ex.: "22/06/2026"
}

const CSS_ETIQUETA = `
  @page { size: 90mm 29mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    width: 90mm; height: 29mm; margin: 0; padding: 0;
    font-family: 'Inter', 'Arial Narrow', system-ui, -apple-system, sans-serif;
    color: #000; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .etiqueta {
    width: 90mm; height: 29mm; padding: 1.5mm 2mm;
    display: flex; align-items: stretch; gap: 2mm; overflow: hidden; position: relative;
  }
  .faixa-cor { position: absolute; top: 0; bottom: 0; left: 0; width: 3mm; background: #6366F1; }
  .col-esq {
    flex: 1; display: flex; flex-direction: column; justify-content: center;
    padding-left: 3mm; overflow: hidden;
  }
  .col-dir {
    width: 30mm; display: flex; flex-direction: column; align-items: center;
    justify-content: center; border-left: 1px solid #999; padding-left: 2mm;
  }
  .header { font-size: 7pt; font-weight: 700; color: #6366F1; line-height: 1; margin-bottom: 1mm; }
  .nome-grande {
    font-size: 13pt; font-weight: 800; line-height: 1; margin-bottom: 1mm;
    word-break: break-word; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .chamada { font-size: 7.5pt; color: #333; line-height: 1.2; }
  .qr-area { text-align: center; }
  .qr-area svg { width: 21mm; height: 21mm; }
  .codigo {
    font-family: 'Courier New', monospace; font-size: 12pt; font-weight: 900;
    letter-spacing: 1.5px; line-height: 1; text-align: center; margin-top: 0.8mm;
  }
  .data-hora { font-size: 6pt; color: #666; margin-top: 0.5mm; text-align: center; }
`;

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function gerarQrSvg(texto: string): Promise<string> {
  return import('bwip-js/browser').then(mod => {
    const bwipjs = (mod as unknown as { default?: { toSVG: (o: object) => string }; toSVG?: (o: object) => string }).default
      || (mod as unknown as { toSVG: (o: object) => string });
    try {
      return bwipjs.toSVG({ bcid: 'qrcode', text: texto, scale: 3, eclevel: 'M' });
    } catch (e) {
      console.warn('[etiquetaBatismo] falha QR, fallback texto:', e);
      return `<text>${escapeHtml(texto)}</text>`;
    }
  }).catch(() => `<text>${escapeHtml(texto)}</text>`);
}

function html(d: DadosEtiquetaBatismo, qrSvg: string): string {
  const data = d.dataLabel ? `<div class="data-hora">${escapeHtml(d.dataLabel)}</div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta">
    <div class="faixa-cor"></div>
    <div class="col-esq">
      <div class="header">⛪ CB Rio · Batismo</div>
      <div class="nome-grande">${escapeHtml(d.nome)}</div>
      <div class="chamada">📷 Aponte a câmera<br>para ver suas fotos</div>
    </div>
    <div class="col-dir">
      <div class="qr-area">${qrSvg}</div>
      <div class="codigo">${escapeHtml(d.codigoConferencia)}</div>
      ${data}
    </div>
  </div>
</body></html>`;
}

function imprimirHtml(htmlStr: string, preview = false): Promise<void> {
  if (preview) {
    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=480,height=200,scrollbars=yes');
      if (!win) {
        console.warn('[etiquetaBatismo] popup bloqueado · libere popups do site');
        resolve();
        return;
      }
      win.document.open();
      win.document.write(htmlStr);
      win.document.close();
      resolve();
    });
  }
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    // Renderiza com tamanho real, fora da tela (Chrome/Edge ignoram print() em iframe 0x0).
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '-9999px';
    iframe.style.width = '90mm';
    iframe.style.height = '29mm';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }
    doc.open();
    doc.write(htmlStr);
    doc.close();

    // Delay pra fontes + QR SVG renderizarem
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('[etiquetaBatismo] erro print:', e);
      }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* já removido */ }
        resolve();
      }, 3000);
    }, 400);
  });
}

// API pública · imprime a etiqueta de batismo (QR + código curto).
// preview=true abre em popup ao invés de mandar pra impressora.
export async function imprimirEtiquetaBatismo(d: DadosEtiquetaBatismo, preview = false): Promise<void> {
  const qrSvg = await gerarQrSvg(d.qrUrl);
  await imprimirHtml(html(d, qrSvg), preview);
}
