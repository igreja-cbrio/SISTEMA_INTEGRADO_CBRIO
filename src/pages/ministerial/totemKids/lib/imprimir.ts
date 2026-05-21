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

// CSS comum das etiquetas · 90mm x 29mm (Brother DK-1201, paisagem)
// Etiqueta de endereco · COMPRIDA na horizontal, estreita na vertical.
// Layout em colunas: bloco esquerdo (identidade) | bloco direito (codigo).
const CSS_ETIQUETA = `
  @page {
    size: 90mm 29mm;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    width: 90mm;
    height: 29mm;
    margin: 0;
    padding: 0;
    font-family: 'Inter', 'Arial Narrow', system-ui, -apple-system, sans-serif;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .etiqueta {
    width: 90mm;
    height: 29mm;
    padding: 1.5mm 2mm;
    display: flex;
    align-items: stretch;
    gap: 2mm;
    overflow: hidden;
    position: relative;
  }
  .faixa-cor {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    width: 3mm;
    background: var(--cor, #EC4899);
  }
  .col-esq {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 3mm;
    overflow: hidden;
  }
  .col-dir {
    width: 32mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-left: 1px solid #999;
    padding-left: 2mm;
  }
  .nome-grande {
    font-size: 13pt;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 1mm;
    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .sala {
    font-size: 9pt;
    font-weight: 700;
    line-height: 1.1;
  }
  .info-sec {
    font-size: 7.5pt;
    color: #444;
    line-height: 1.2;
    margin-top: 0.5mm;
  }
  .alerta {
    background: #000;
    color: #fff;
    padding: 0.7mm 1.5mm;
    margin-top: 1mm;
    font-size: 7pt;
    font-weight: 700;
    line-height: 1.1;
    border-radius: 0.5mm;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .codigo {
    font-family: 'Courier New', monospace;
    font-size: 20pt;
    font-weight: 900;
    letter-spacing: 2px;
    line-height: 1;
    text-align: center;
  }
  .barcode-area {
    margin-top: 1mm;
    text-align: center;
  }
  .barcode-area svg {
    max-width: 28mm;
    height: 6mm;
  }
  .data-hora {
    font-size: 6.5pt;
    color: #555;
    margin-top: 1mm;
    text-align: center;
    line-height: 1.1;
  }
  .header-resp {
    font-size: 7pt;
    font-weight: 700;
    color: #444;
    text-align: center;
    margin-bottom: 1mm;
    line-height: 1.1;
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
    <div class="faixa-cor"></div>
    <div class="col-esq">
      <div class="nome-grande">${escapeHtml(d.crianca.nome)}</div>
      <div class="sala">${escapeHtml(d.crianca.salaNome)}</div>
      <div class="info-sec">${escapeHtml(d.crianca.idadeLabel)} · ${escapeHtml(d.dataHora)}</div>
      ${alertaMedico}
    </div>
    <div class="col-dir">
      <div class="codigo">${d.codigoSeguranca}</div>
      <div class="data-hora">Cód de segurança</div>
    </div>
  </div>
</body></html>`;
}

function htmlEtiquetaResponsavel(d: DadosImpressao, barcodeSvg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta">
    <div class="col-esq" style="padding-left:0">
      <div class="header-resp">⛪ CB Rio · Recibo Kids</div>
      <div class="nome-grande" style="font-size:11pt">${escapeHtml(d.crianca.nome)}</div>
      <div class="sala" style="font-size:8pt;color:#555">${escapeHtml(d.crianca.salaNome)}</div>
      <div class="data-hora" style="text-align:left;margin-top:auto">
        ${escapeHtml(d.dataHora)} · Apresente para buscar
      </div>
    </div>
    <div class="col-dir">
      <div class="codigo">${d.codigoSeguranca}</div>
      <div class="barcode-area">${barcodeSvg}</div>
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
    // a etiqueta real (90x29mm ~ 340x110px paisagem) com margem pra borda.
    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=480,height=200,scrollbars=yes');
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
    // Brother DK-1201 paisagem: 90mm largura x 29mm altura.
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
