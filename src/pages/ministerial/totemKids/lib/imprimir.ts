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

// CSS comum das etiquetas · 29mm x 90mm (Brother DK-1201)
// Etiqueta pre-cortada estreita e longa. Layout vertical compacto.
const CSS_ETIQUETA = `
  @page {
    size: 29mm 90mm;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    width: 29mm;
    height: 90mm;
    margin: 0;
    padding: 0;
    font-family: 'Inter', 'Arial Narrow', system-ui, -apple-system, sans-serif;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .etiqueta {
    width: 29mm;
    height: 90mm;
    padding: 2mm 1.5mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    text-align: center;
  }
  .borda-cor {
    height: 3mm;
    background: var(--cor, #EC4899);
    margin: -2mm -1.5mm 2mm -1.5mm;
  }
  .header {
    font-size: 7pt;
    color: #444;
    border-bottom: 1px solid #999;
    padding-bottom: 1mm;
    margin-bottom: 1.5mm;
    line-height: 1.1;
  }
  .nome-grande {
    font-size: 14pt;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 1mm;
    word-break: break-word;
  }
  .info {
    font-size: 8.5pt;
    line-height: 1.2;
    margin-bottom: 1mm;
  }
  .info b { font-weight: 700; }
  .alerta {
    background: #000;
    color: #fff;
    padding: 1mm 1.5mm;
    margin: 1mm 0;
    font-size: 7pt;
    font-weight: 700;
    line-height: 1.1;
    border-radius: 0.5mm;
  }
  .codigo {
    font-family: 'Courier New', monospace;
    font-size: 18pt;
    font-weight: 900;
    letter-spacing: 2px;
    margin: 1.5mm 0;
    border: 1.5px solid #000;
    padding: 1mm 0;
  }
  .barcode-area {
    margin: 1mm 0;
  }
  .barcode-area svg {
    max-width: 26mm;
    height: 8mm;
  }
  .footer {
    margin-top: auto;
    font-size: 6.5pt;
    color: #555;
    border-top: 1px solid #ccc;
    padding-top: 1mm;
    line-height: 1.2;
  }
`;

function gerarBarcodeSvg(codigo: string): Promise<string> {
  // Lazy import (so carrega quando precisa imprimir)
  return import('bwip-js/browser').then(mod => {
    const bwipjs = (mod as unknown as { default?: { toSVG: (o: object) => string }; toSVG?: (o: object) => string }).default
      || (mod as unknown as { toSVG: (o: object) => string });
    // Code128 · escala reduzida pra caber em etiqueta de 29mm de largura
    const opts = {
      bcid: 'code128',
      text: codigo,
      scale: 1,
      height: 8,
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
      ${escapeHtml(d.dataHora)}
    </div>
  </div>
</body></html>`;
}

function htmlEtiquetaResponsavel(d: DadosImpressao, barcodeSvg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta">
    <div class="header">⛪ CB Rio<br/>Recibo Kids</div>
    <div class="info">
      <b>${escapeHtml(d.crianca.nome)}</b><br/>
      <span style="color: #555">${escapeHtml(d.crianca.salaNome)}</span>
    </div>
    <div class="codigo">${d.codigoSeguranca}</div>
    <div class="barcode-area">${barcodeSvg}</div>
    <div class="footer">
      ${escapeHtml(d.dataHora)}<br/>
      <span style="font-size: 6pt">Apresente para buscar</span>
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
    // ir pra impressora. Útil pra teste/debug. Janela um pouco maior que
    // a etiqueta real (29x90mm ~ 110x340px) com margem pra scroll/borda.
    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=200,height=480,scrollbars=yes');
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
    // Dimensoes da Brother DK-1201: 29mm x 90mm
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '-9999px';
    iframe.style.width = '29mm';
    iframe.style.height = '90mm';
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
