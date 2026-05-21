// Impressao das etiquetas Kids · MVP usa window.print() do navegador.
//
// Estrategia:
//   1. Cria iframe oculto com HTML completo + CSS @page 62mmx100mm
//   2. Aguarda load
//   3. Chama iframe.contentWindow.print()
//   4. Remove iframe apos delay
//   5. Loga em /api/totem-kids/etiquetas-log
//
// Pre-requisito (setup do totem · uma vez):
//   - Brother QL-820NWB instalada no Windows do totem
//   - Configurada como impressora padrao
//   - Edge/Chrome com "sem dialogo de impressao" (ja default em printer kiosk)

import { totemKids } from '@/api';

export interface DadosImpressao {
  checkinId: string;
  estacaoId?: string | null;
  crianca: {
    nome: string;
    idadeLabel: string;
    salaNome: string;
    salaCor?: string;
    observacoesMedicas?: string | null;
  };
  responsavel: {
    nome: string;
  };
  codigoSeguranca: string;
  codigoBarras: string;       // mesmo do codigo, codificado pra Code128
  dataHora: string;            // ISO ou label pronto
  cultoNome?: string;
}

// CSS comum das etiquetas · 62mm x 100mm (DK-22251)
const CSS_ETIQUETA = `
  @page {
    size: 62mm 100mm;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    width: 62mm;
    height: 100mm;
    margin: 0;
    padding: 0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .etiqueta {
    width: 62mm;
    height: 100mm;
    padding: 4mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    font-size: 9pt;
    text-align: center;
    color: #555;
    border-bottom: 1px solid #999;
    padding-bottom: 2mm;
    margin-bottom: 3mm;
  }
  .nome-grande {
    font-size: 20pt;
    font-weight: 800;
    line-height: 1.05;
    margin-bottom: 2mm;
    word-break: break-word;
  }
  .info { font-size: 11pt; line-height: 1.3; }
  .info b { font-weight: 700; }
  .alerta {
    background: #000;
    color: #fff;
    padding: 2mm 3mm;
    margin: 2mm 0;
    font-size: 10pt;
    font-weight: 700;
    border-radius: 1mm;
  }
  .codigo {
    font-family: 'Courier New', monospace;
    font-size: 28pt;
    font-weight: 800;
    letter-spacing: 4px;
    text-align: center;
    margin: 3mm 0;
    border: 2px solid #000;
    padding: 2mm;
  }
  .barcode-area {
    text-align: center;
    margin-top: 2mm;
  }
  .footer {
    margin-top: auto;
    font-size: 8pt;
    color: #777;
    text-align: center;
    border-top: 1px solid #ccc;
    padding-top: 2mm;
  }
  .borda-cor {
    border-top: 4mm solid var(--cor, #EC4899);
    margin: -4mm -4mm 3mm -4mm;
  }
`;

function gerarBarcodeSvg(codigo: string): Promise<string> {
  // Lazy import (so carrega quando precisa imprimir)
  return import('bwip-js/browser').then(mod => {
    const bwipjs = (mod as unknown as { default?: { toSVG: (o: object) => string }; toSVG?: (o: object) => string }).default
      || (mod as unknown as { toSVG: (o: object) => string });
    // Code128
    const opts = {
      bcid: 'code128',
      text: codigo,
      scale: 2,
      height: 10,
      includetext: false,
      backgroundcolor: 'FFFFFF',
    };
    try {
      const svg = bwipjs.toSVG(opts);
      return svg;
    } catch (e) {
      console.warn('[totemKids/imprimir] falha barcode, fallback texto:', e);
      return `<text>${codigo}</text>`;
    }
  }).catch(() => `<text>${codigo}</text>`);
}

function htmlEtiquetaCrianca(d: DadosImpressao, barcodeSvg: string): string {
  const alertaMedico = d.crianca.observacoesMedicas
    ? `<div class="alerta">⚠ ${escapeHtml(d.crianca.observacoesMedicas)}</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta" style="--cor: ${d.crianca.salaCor || '#EC4899'}">
    <div class="borda-cor"></div>
    <div class="nome-grande">${escapeHtml(d.crianca.nome)}</div>
    <div class="info">
      <b>${escapeHtml(d.crianca.salaNome)}</b><br/>
      ${escapeHtml(d.crianca.idadeLabel)}
    </div>
    ${alertaMedico}
    <div class="codigo">${d.codigoSeguranca}</div>
    <div class="footer">
      ${escapeHtml(d.cultoNome || '')}<br/>
      ${escapeHtml(d.dataHora)}
    </div>
  </div>
</body></html>`;
}

function htmlEtiquetaResponsavel(d: DadosImpressao, barcodeSvg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta">
    <div class="header">⛪ CB Rio · Recibo Kids</div>
    <div class="info">
      <b>${escapeHtml(d.crianca.nome)}</b><br/>
      <span style="color: #555">${escapeHtml(d.crianca.salaNome)}</span>
    </div>
    <div class="codigo">${d.codigoSeguranca}</div>
    <div class="barcode-area">${barcodeSvg}</div>
    <div class="footer">
      ${escapeHtml(d.dataHora)}<br/>
      <span style="font-size: 7pt">Apresente este recibo<br/>para buscar a criança.</span>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function imprimirHtml(html: string, preview = false): Promise<void> {
  if (preview) {
    // Modo preview · abre popup visivel pro usuario conferir layout antes de
    // ir pra impressora. Útil pra teste/debug.
    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=320,height=520,scrollbars=yes');
      if (!win) {
        console.warn('[totemKids/imprimir] popup bloqueado · libere popups do site');
        resolve();
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      resolve();
    });
  }
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    // Renderiza com tamanho real MAS fora da tela. Evita bugs de iframe 0x0
    // em Chrome/Edge que ignoram print() quando o iframe nao tem dimensao.
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '-9999px';
    iframe.style.width = '62mm';
    iframe.style.height = '100mm';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    // Delay pra fontes + barcode SVG renderizarem
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('[totemKids/imprimir] erro print:', e);
      }
      // Remove apos 3s (tempo do spool + confirmacao do dialogo)
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* iframe ja removido */ }
        resolve();
      }, 3000);
    }, 400);
  });
}

// API pública · imprime as 2 etiquetas e loga
// preview=true abre as etiquetas em popup ao inves de mandar pra impressora
export async function imprimirEtiquetas(d: DadosImpressao, preview = false): Promise<void> {
  const barcodeSvg = await gerarBarcodeSvg(d.codigoBarras);

  // Etiqueta da criança
  await imprimirHtml(htmlEtiquetaCrianca(d, barcodeSvg), preview);
  if (!preview) {
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'crianca',
      conteudo: {
        nome: d.crianca.nome,
        sala: d.crianca.salaNome,
        idade: d.crianca.idadeLabel,
        codigo: d.codigoSeguranca,
        observacoes_medicas: d.crianca.observacoesMedicas,
      },
      status: 'enviada',
    }).catch(() => {});
  }

  // Etiqueta do responsável
  await imprimirHtml(htmlEtiquetaResponsavel(d, barcodeSvg), preview);
  if (preview) return;  // nao loga impressao em modo preview
  totemKids.etiquetas.log({
    checkin_id: d.checkinId,
    estacao_id: d.estacaoId,
    tipo: 'responsavel',
    conteudo: {
      crianca: d.crianca.nome,
      sala: d.crianca.salaNome,
      codigo: d.codigoSeguranca,
    },
    status: 'enviada',
  }).catch(() => {});
}

// Reimpressao (etiqueta rasgou ou impressora falhou)
export async function reimprimirEtiqueta(d: DadosImpressao, tipo: 'crianca' | 'responsavel', motivo: string): Promise<void> {
  const barcodeSvg = await gerarBarcodeSvg(d.codigoBarras);
  const html = tipo === 'crianca' ? htmlEtiquetaCrianca(d, barcodeSvg) : htmlEtiquetaResponsavel(d, barcodeSvg);
  await imprimirHtml(html);
  totemKids.etiquetas.log({
    checkin_id: d.checkinId,
    estacao_id: d.estacaoId,
    tipo,
    conteudo: { nome: d.crianca.nome, codigo: d.codigoSeguranca },
    reimpressao: true,
    motivo_reimpressao: motivo,
    status: 'enviada',
  }).catch(() => {});
}
