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
    salaLogoUrl?: string | null;      // logo da categoria/sala (por faixa de idade)
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
  layout?: EtiquetaLayout;           // ajustes de layout (tamanho/posição da logo…)
}

// Configuração de layout da etiqueta (ajustável nas Configurações → Etiqueta)
export interface EtiquetaLayout {
  logoTamanho?: 'P' | 'M' | 'G';                 // tamanho da logo da categoria
  logoPosicao?: 'esquerda' | 'direita' | 'acima'; // posição da logo em relação ao nome
  nomeTamanho?: 'auto' | 'P' | 'M' | 'G';        // fonte do nome (auto = pelo comprimento)
}

export const LAYOUT_ETIQUETA_PADRAO: EtiquetaLayout = {
  logoTamanho: 'M',
  logoPosicao: 'esquerda',
  nomeTamanho: 'auto',
};

// Altura da logo (mm) por tamanho
const LOGO_MM: Record<string, number> = { P: 4.5, M: 6, G: 8.5 };

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
  .logo-sala {
    height: 6mm;
    max-width: 16mm;
    object-fit: contain;
    flex-shrink: 0;
  }
  .foto-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    flex-shrink: 0;
  }
  .foto-badge svg { display: block; }
  .topo-logo {
    display: flex;
    justify-content: flex-start;
    margin-bottom: 0.5mm;
  }
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

// Nome na etiqueta: SEMPRE o nome completo (pedido do Matheus 2026-07-09). Pra
// caber no espaço, a fonte diminui conforme o comprimento e o nome pode quebrar
// em até 2 linhas (sem reticências cortando o sobrenome).
function nomeParaEtiqueta(nome: string): string {
  return String(nome || '').trim().replace(/\s+/g, ' ');
}

// Tamanho de fonte do nome em função do comprimento (pt) — nome completo cabe.
// Se o layout fixar um tamanho (P/M/G), usa esse; senão calcula pelo comprimento.
function fonteNome(nome: string, tamanho?: EtiquetaLayout['nomeTamanho']): number {
  if (tamanho === 'P') return 9;
  if (tamanho === 'M') return 11;
  if (tamanho === 'G') return 13;
  const n = nomeParaEtiqueta(nome).length;
  if (n <= 16) return 13;
  if (n <= 22) return 11.5;
  if (n <= 30) return 10;
  if (n <= 40) return 8.5;
  return 7.5;
}

// Ícone SVG (não emoji — emoji sai quebrado na Brother). Câmera OK / câmera
// cortada (proibido) pro voluntário saber quando NÃO há autorização de foto.
const ICONE_CAMERA_OK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const ICONE_CAMERA_NAO = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="2" y1="2" x2="22" y2="22" stroke-width="2.4"/></svg>`;

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
  // Selo de foto: ícone SVG de câmera. Sem autorização → câmera cortada
  // (proibido) pro voluntário saber na hora (nada de escrever "SEM FOTO").
  const foto = d.crianca.fotoAutorizada
    ? `<span class="foto-badge">${ICONE_CAMERA_OK}</span>`
    : `<span class="foto-badge">${ICONE_CAMERA_NAO}</span>`;
  const aniversario = d.crianca.aniversarioSemana
    ? `<div class="aniversario">Feliz aniversário, ${escapeHtml((d.crianca.nome || '').split(' ')[0])}!</div>`
    : '';
  // Layout ajustável (tamanho/posição da logo, fonte do nome)
  const layout = { ...LAYOUT_ETIQUETA_PADRAO, ...(d.layout || {}) };
  const logoMm = LOGO_MM[layout.logoTamanho || 'M'] || 6;
  const logo = d.crianca.salaLogoUrl
    ? `<img class="logo-sala" style="height:${logoMm}mm" src="${escapeHtml(d.crianca.salaLogoUrl)}" alt="" />`
    : '';
  const nome = `<div class="nome-grande" style="margin:0;font-size:${fonteNome(d.crianca.nome, layout.nomeTamanho)}pt">${escapeHtml(nomeParaEtiqueta(d.crianca.nome))}</div>`;
  // Monta a linha topo conforme a posição da logo
  let topo: string;
  if (layout.logoPosicao === 'acima' && logo) {
    topo = `<div class="topo-logo">${logo}</div><div class="topo">${nome}${foto}</div>`;
  } else if (layout.logoPosicao === 'direita') {
    topo = `<div class="topo">${nome}${foto}${logo}</div>`;
  } else {
    topo = `<div class="topo">${logo}${nome}${foto}</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_ETIQUETA}</style></head>
<body>
  <div class="etiqueta" style="--cor: ${d.crianca.salaCor || '#EC4899'}">
    <div class="faixa-cor"></div>
    <div class="col-esq">
      ${topo}
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

// Pré-carrega a logo antes de mandar pra impressora — o iframe imprime com um
// delay curto e uma imagem externa não-cacheada poderia não renderizar a tempo.
function preloadImg(url?: string | null): Promise<void> {
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
    // rede-de-segurança: não trava a impressão se a imagem demorar
    setTimeout(resolve, 2500);
  });
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

// HTML da etiqueta da criança pra PRÉVIA na tela (iframe srcDoc). Sem barcode
// (a etiqueta da criança não tem) — reflete logo + layout escolhidos.
export function gerarHtmlPreviewCrianca(d: DadosImpressao): string {
  return htmlEtiquetaCrianca(d, '');
}

// API pública · imprime as 2 etiquetas e loga
// preview=true abre as etiquetas em popup ao inves de mandar pra impressora
export async function imprimirEtiquetas(d: DadosImpressao, preview = false): Promise<void> {
  const [barcodeSvg] = await Promise.all([gerarBarcodeSvg(d.codigoBarras), preloadImg(d.crianca.salaLogoUrl)]);

  // No CHECK-IN: 2 etiquetas da criança (uma na criança, outra na sacola/
  // pertences) + 1 do responsável (recibo). Na reimpressão sai só a da criança.
  const htmlCrianca = htmlEtiquetaCrianca(d, barcodeSvg);
  await imprimirHtml(htmlCrianca, preview);
  await imprimirHtml(htmlCrianca, preview);
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
        copias: 2,
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
  const [barcodeSvg] = await Promise.all([gerarBarcodeSvg(d.codigoBarras), preloadImg(d.crianca.salaLogoUrl)]);
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
