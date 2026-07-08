// Impressão das etiquetas Kids · MVP usa window.print() do navegador.
//
// Estrategia:
//   1. Cria iframe oculto com HTML completo + CSS @page 62mmx100mm
//   2. Aguarda load
//   3. Chama iframe.contentWindow.print()
//   4. Remove iframe após delay
//   5. Loga em /api/totem-kids/etiquetas-log
//
// Pre-requisito (setup do totem · uma vez):
//   - Brother QL-820NWB instalada no Windows do totem
//   - Configurada como impressora padrão
//   - Edge/Chrome com "sem dialogo de impressão" (já default em printer kiosk)

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
    alergia?: string | null;          // alergia em destaque (vermelho/preto)
    necessidade?: string | null;      // espectro/limitação/necessidade
    fotoAutorizada?: boolean;         // ícone de câmera (com X se não autorizada)
    aniversarioSemana?: boolean;      // personaliza a etiqueta no aniversário
  };
  responsavel: {
    nome: string;
  };
  codigoSeguranca: string;            // código alfanumérico · MESMO nas duas etiquetas
  codigoBarras: string;               // mesmo do código, codificado pra Code128
  dataHora: string;                   // ISO ou label pronto
  cultoNome?: string;
  cultoDiaHora?: string;              // dia + horário do culto (etiqueta do responsável)
}

// CSS comum das etiquetas · 90mm x 29mm (Brother DK-1201, paisagem)
// Etiqueta de endereço · COMPRIDA na horizontal, estreita na vertical.
// Layout em colunas: bloco esquerdo (identidade) | bloco direito (código).
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
  .topo {
    display: flex;
    align-items: center;
    gap: 1.5mm;
    margin-bottom: 0.5mm;
  }
  .foto-badge {
    border: 1.2px solid #000;
    border-radius: 1mm;
    padding: 0 1mm;
    font-size: 7pt;
    font-weight: 800;
    white-space: nowrap;
  }
  .foto-no { background: #000; color: #fff; }
  .aniversario {
    background: #000;
    color: #fff;
    text-align: center;
    font-size: 7.5pt;
    font-weight: 800;
    padding: 0.6mm 1mm;
    margin-top: 1mm;
    border-radius: 0.5mm;
  }
  .cod-label { font-size: 6.5pt; color: #555; text-align: center; margin-top: 0.5mm; }
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

// Nome na etiqueta: nome completo até o limite; acima disso vira
// "Primeiro Último" (o clamp de 2 linhas cortava o fim com reticências e o
// sobrenome sumia — pedido do Marcos 2026-07-08). Se um dia precisarem de
// apelido/nome social, vira campo próprio na ficha; por ora é automático.
const NOME_ETIQUETA_MAX = 24;
function nomeParaEtiqueta(nome: string): string {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (limpo.length <= NOME_ETIQUETA_MAX) return limpo;
  const partes = limpo.split(' ');
  const curto = partes.length >= 2 ? `${partes[0]} ${partes[partes.length - 1]}` : limpo;
  return curto.length <= NOME_ETIQUETA_MAX ? curto : `${curto.slice(0, NOME_ETIQUETA_MAX - 1)}…`;
}

// ⚠️ Emoji em HTML de impressão é loteria (o 📷 saiu como ícone quebrado na
// Brother/preview · Diego 2026-07-08) → só texto puro nos templates de etiqueta.
function htmlEtiquetaCrianca(d: DadosImpressao, barcodeSvg: string): string {
  // Alergia/necessidade em destaque (barra preta). Junta alergia + necessidade.
  const saude = [
    d.crianca.alergia ? `ALERGIA: ${d.crianca.alergia}` : '',
    d.crianca.necessidade || '',
    !d.crianca.alergia && !d.crianca.necessidade ? (d.crianca.observacoesMedicas || '') : '',
  ].filter(Boolean).join(' · ');
  const alerta = saude ? `<div class="alerta">! ${escapeHtml(saude)}</div>` : '';
  // Selo de consentimento de foto (texto puro · sem emoji na impressão)
  const foto = d.crianca.fotoAutorizada
    ? `<span class="foto-badge">FOTO OK</span>`
    : `<span class="foto-badge foto-no">SEM FOTO</span>`;
  const aniversario = d.crianca.aniversarioSemana
    ? `<div class="aniversario">Feliz aniversário, ${escapeHtml((d.crianca.nome || '').split(' ')[0])}!</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta" style="--cor: ${d.crianca.salaCor || '#EC4899'}">
    <div class="faixa-cor"></div>
    <div class="col-esq">
      <div class="topo">
        <div class="nome-grande" style="margin:0">${escapeHtml(nomeParaEtiqueta(d.crianca.nome))}</div>
        ${foto}
      </div>
      <div class="sala">${escapeHtml(d.crianca.salaNome)} · ${escapeHtml(d.crianca.idadeLabel)}</div>
      ${aniversario}
      ${alerta}
    </div>
    <div class="col-dir">
      <div class="codigo">${d.codigoSeguranca}</div>
      <div class="cod-label">Código</div>
    </div>
  </div>
</body></html>`;
}

// Recibo do responsável: por segurança NÃO leva o nome da criança (quem achar
// a etiqueta perdida não descobre de qual criança é) — mostra o nome do
// RESPONSÁVEL; o vínculo com a criança fica só pelo código, no sistema.
function htmlEtiquetaResponsavel(d: DadosImpressao, barcodeSvg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta">
    <div class="col-esq" style="padding-left:0">
      <div class="header-resp">CB Rio · Recibo Kids</div>
      <div class="nome-grande" style="font-size:11pt">${escapeHtml(nomeParaEtiqueta(d.responsavel.nome))}</div>
      <div class="sala" style="font-size:8pt;color:#555">${escapeHtml(d.cultoDiaHora || d.crianca.salaNome)}</div>
      <div class="data-hora" style="text-align:left;margin-top:auto">
        ${escapeHtml(d.dataHora)} · Apresente este código para buscar
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
    // Modo preview · abre popup visível pro usuário conferir layout antes de
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
    // em Chrome/Edge que ignoram print() quando o iframe não tem dimensão.
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
      // Remove após 3s (tempo do spool + confirmação do dialogo)
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* iframe já removido */ }
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
  if (preview) return;  // não loga impressão em modo preview
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
