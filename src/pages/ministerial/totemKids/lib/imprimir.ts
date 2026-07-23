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
  criancaId?: string;                 // pra checar o limite de 2 etiquetas de aniversário/semana
  estacaoId?: string | null;
  crianca: {
    nome: string;
    idadeLabel: string;
    idadeAnos?: number | null;        // idade em anos (etiqueta de aniversário)
    salaNome: string;
    salaCor?: string;
    salaLogoUrl?: string | null;      // logo da categoria/sala (por faixa de idade)
    observacoesMedicas?: string | null;
    alergia?: string | null;          // alergia em destaque (vermelho/preto)
    necessidade?: string | null;      // espectro/limitação/necessidade
    fotoAutorizada?: boolean;         // AUTORIZAÇÃO DE USO DE IMAGEM (consent_marketing) · autoriza = etiqueta limpa; NÃO autoriza = câmera cortada
    aniversarioSemana?: boolean;      // dispara a 4ª etiqueta de aniversário
  };
  responsavel: {
    nome: string;
  };
  codigoSeguranca: string;            // código alfanumérico · MESMO nas duas etiquetas
  codigoBarras: string;               // mesmo do código, codificado pra Code128
  dataHora: string;                   // ISO ou label pronto
  cultoNome?: string;
  cultoDiaHora?: string;              // dia + horário do culto (etiqueta do responsável)
  ensaio?: boolean;                   // sessão de culto de OUTRO dia (modo ensaio) → etiquetas saem marcadas TESTE
  layout?: EtiquetaLayout;           // ajustes de layout (tamanho/posição da logo…)
  logoAniversarioUrl?: string | null; // logo do Kids na etiqueta de aniversário (config global)
}

// Configuração de layout da etiqueta (ajustável nas Configurações → Etiqueta)
export type FonteEtiqueta = 'sans' | 'condensada' | 'arredondada' | 'serif' | 'mono';
export type EscalaEtiqueta = 'P' | 'M' | 'G' | 'GG';

export interface EtiquetaLayout {
  fonte?: FonteEtiqueta;                          // família da fonte da etiqueta
  escalaFonte?: EscalaEtiqueta;                   // escala global do tamanho (P/M/G/GG)
  nomeTamanho?: 'auto' | 'P' | 'M' | 'G';         // fonte do nome (auto = pelo comprimento)
  // Descontinuados (a logo das salas saiu da etiqueta em 2026-07-20) — mantidos
  // por retrocompatibilidade; não são mais usados na renderização.
  logoTamanho?: 'P' | 'M' | 'G';
  logoPosicao?: 'esquerda' | 'direita' | 'acima';
}

export const LAYOUT_ETIQUETA_PADRAO: EtiquetaLayout = {
  fonte: 'sans',
  escalaFonte: 'M',
  nomeTamanho: 'auto',
};

// Família da fonte por opção → pilha de fontes segura pra impressão (só o que
// costuma existir no Windows do totem; cai pro genérico se faltar).
const FONTES: Record<FonteEtiqueta, string> = {
  sans:        "'Inter','Helvetica Neue',Arial,system-ui,sans-serif",
  condensada:  "'Arial Narrow','Roboto Condensed','Liberation Sans Narrow',sans-serif",
  arredondada: "'Trebuchet MS','Segoe UI',Verdana,sans-serif",
  serif:       "Georgia,'Times New Roman',Times,serif",
  mono:        "'Courier New',Consolas,monospace",
};

// Multiplicador global do tamanho da fonte por escala.
const ESCALAS: Record<EscalaEtiqueta, number> = { P: 0.88, M: 1, G: 1.14, GG: 1.28 };

// CSS das etiquetas · 90mm x 29mm (Brother DK-1201, paisagem). Layout em duas
// colunas: bloco esquerdo (identidade) | bloco direito (código).
//
// A FONTE (família) e a ESCALA (tamanho) vêm da config e entram por variáveis
// CSS: `--fonte` na família e `--escala` multiplicando cada tamanho via calc().
// O tamanho do nome vem por `--nome-pt` (inline, calculado pelo comprimento) e
// também é escalado. Assim a etiqueta é PADRONIZADA (um só template) e tudo que
// varia é configurável num lugar só.
function cssEtiqueta(layout: EtiquetaLayout = LAYOUT_ETIQUETA_PADRAO): string {
  const fonte = FONTES[layout.fonte || 'sans'] || FONTES.sans;
  const escala = ESCALAS[layout.escalaFonte || 'M'] ?? 1;
  // tamanho escalado, em pt (usa a variável --escala pra o preview refletir na hora)
  const pt = (base: number) => `calc(${base}pt * var(--escala))`;
  return `
  :root { --fonte: ${fonte}; --escala: ${escala}; }
  @page { size: 90mm 29mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    width: 90mm; margin: 0; padding: 0;
    font-family: var(--fonte);
    color: #000; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Cada etiqueta ocupa uma página; a Brother corta entre elas (1 job só). */
  .pagina { break-inside: avoid; }
  .etiqueta {
    width: 90mm; height: 29mm; padding: 1.5mm 2mm;
    display: flex; align-items: stretch; gap: 2mm;
    overflow: hidden; position: relative;
  }
  /* Faixa de cor da sala (única marca visual da categoria — a logo saiu). */
  .faixa-cor { position: absolute; top: 0; bottom: 0; left: 0; width: 3mm; background: var(--cor, #EC4899); }
  .col-esq { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-left: 3mm; overflow: hidden; }
  /* Divisor TRACEJADO antes do código (visual do sistema antigo · Milena 22/07). */
  .col-dir { width: 30mm; display: flex; flex-direction: column; align-items: center; justify-content: center; border-left: 0.5mm dashed #444; padding-left: 2mm; flex-shrink: 0; }
  /* Idade em destaque: número grande + legenda, como no sistema antigo. */
  .col-idade { width: 11mm; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
  .idade-num { font-size: ${pt(17)}; font-weight: 900; line-height: 1; }
  .idade-num-p { font-size: ${pt(11)}; }
  .idade-cap { font-size: ${pt(6.5)}; font-weight: 700; color: #333; margin-top: 0.5mm; }

  .topo { display: flex; align-items: center; gap: 1.5mm; }
  .foto-badge { display: inline-flex; align-items: center; justify-content: center; line-height: 0; flex-shrink: 0; }
  .foto-badge svg { display: block; }

  /* Primeiro nome em destaque + resto do nome completo menor embaixo. */
  .nome-primeiro {
    font-size: calc(var(--nome-pt, 16) * var(--escala) * 1pt);
    font-weight: 800; line-height: 1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .nome-resto {
    font-size: ${pt(8.5)}; font-weight: 700; line-height: 1.05; margin-top: 0.3mm;
    word-break: break-word; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .sala { font-size: ${pt(9)}; font-weight: 700; line-height: 1.1; margin-top: 0.4mm; }

  /* Banda PRETA do código (branco no preto) + réguas finas em cima/embaixo —
     eco da estética de barcode da etiqueta antiga; imprime bem na térmica. */
  .band-wrap { width: 100%; }
  .band-rule { height: 0.45mm; background: #000; border-radius: 0.2mm; margin: 0.35mm 0; }
  .codigo-band {
    background: #000; color: #fff; font-family: 'Courier New', monospace;
    font-weight: 900; font-size: ${pt(16)}; letter-spacing: 2.5px;
    text-align: center; line-height: 1; padding: 1mm 1mm 0.8mm; border-radius: 0.6mm;
  }
  .codigo-band-g { font-size: ${pt(21)}; letter-spacing: 3px; }
  /* Etiqueta da criança (Mariane 2026-07-22): o código ocupa a coluna INTEIRA
     da direita, sem legenda — identificação instantânea no salão/portão. */
  .codigo-band-cheia { font-size: ${pt(24)}; letter-spacing: 2px; flex: 1; display: flex; align-items: center; justify-content: center; padding: 1mm 0.5mm; }
  .col-dir-cheia { padding-top: 1mm; padding-bottom: 1mm; }
  .col-dir-cheia .band-wrap { flex: 1; display: flex; flex-direction: column; }
  /* Recibo do responsável (v2 · Marcos 22/07): nome + logo + culto à esquerda;
     código na banda preta + barcode à direita, divisor tracejado no meio. */
  .recibo-nome { font-size: ${pt(10)}; font-weight: 800; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .recibo-logo { display: block; height: 6mm; max-width: 26mm; object-fit: contain; align-self: flex-start; margin: 0.6mm 0 0.4mm; }
  .recibo-hint { font-size: ${pt(6.5)}; color: #555; line-height: 1.1; margin-top: 0.3mm; }
  .recibo-dir { width: 42mm; justify-content: center; }
  .recibo-dir .barcode-area svg { max-width: 34mm; height: 7mm; }
  .recibo-culto { font-size: ${pt(8)}; font-weight: 800; line-height: 1.1; }
  .info-sec { font-size: ${pt(7.5)}; color: #444; line-height: 1.2; margin-top: 0.5mm; }
  /* Alerta de saúde (alergia/necessidade): PRETO NO BRANCO (a tarja preta saía
     ilegível na térmica · Mari 2026-07-22), negrito, fonte maior (~9.5pt), uma
     linha com símbolo de alerta + texto com ellipsis de segurança. */
  .alerta {
    color: #000; font-weight: 800; font-size: ${pt(9.5)}; line-height: 1.1;
    margin-top: 1mm; display: flex; align-items: center; gap: 1mm; overflow: hidden;
  }
  .alerta svg { width: 3.6mm; height: 3.6mm; flex-shrink: 0; }
  .alerta-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Faixa de ENSAIO (modo teste · culto de outro dia): a etiqueta física não
     pode ter cara de check-in real — ela sobrevive à tela. */
  .ensaio-strip {
    background: #000; color: #fff; padding: 0.6mm 1.5mm; margin-bottom: 0.6mm;
    font-size: ${pt(6.5)}; font-weight: 800; letter-spacing: 0.6px; line-height: 1.1;
    border-radius: 0.5mm; text-align: center; white-space: nowrap; overflow: hidden;
  }

  /* Código de segurança · sempre monoespaçado (evita confundir O/0, I/1). */
  .codigo { font-family: 'Courier New', monospace; font-size: ${pt(20)}; font-weight: 900; letter-spacing: 2px; line-height: 1; text-align: center; }
  .cod-label { font-size: ${pt(6.5)}; color: #555; text-align: center; margin-top: 0.5mm; }
  .barcode-area { margin-top: 1mm; text-align: center; }
  .barcode-area svg { max-width: 28mm; height: 6mm; }
  .data-hora { font-size: ${pt(6.5)}; color: #555; margin-top: 1mm; text-align: center; line-height: 1.1; }
  .header-resp { font-size: ${pt(7)}; font-weight: 700; color: #444; text-align: center; margin-bottom: 1mm; line-height: 1.1; }

  /* Etiqueta de aniversário (4ª · na semana do aniversário) */
  .etiqueta.aniv { flex-direction: column; align-items: stretch; gap: 1mm; padding: 1.5mm 3mm; }
  .aniv-banner { background: #000; color: #fff; font-weight: 900; font-size: ${pt(12)}; text-align: center; letter-spacing: 0.5px; padding: 1mm 0; border-radius: 0.5mm; }
  .aniv-row { display: flex; align-items: center; justify-content: space-between; gap: 2mm; flex: 1; }
  .aniv-logo { height: 9mm; max-width: 30mm; object-fit: contain; }
  .aniv-idade { font-size: ${pt(15)}; font-weight: 900; white-space: nowrap; }
  .aniv-bolo { line-height: 0; }
  .aniv-bolo svg { height: 13mm; width: auto; display: block; }
  `;
}

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

// Nome em duas linhas de peso diferente (visual do sistema antigo · Milena
// 2026-07-22): PRIMEIRO nome grande + resto do nome menor embaixo — continua
// saindo o nome COMPLETO (regra do Matheus 2026-07-09), só muda a hierarquia.
function partesNome(nome: string): { primeiro: string; resto: string } {
  const p = nomeParaEtiqueta(nome).split(' ');
  return { primeiro: p[0] || '', resto: p.slice(1).join(' ') };
}

// Fonte do PRIMEIRO nome pelo comprimento (pt) — preset P/M/G da config vence.
function fontePrimeiroNome(primeiro: string, tamanho?: EtiquetaLayout['nomeTamanho']): number {
  if (tamanho === 'P') return 11;
  if (tamanho === 'M') return 13;
  if (tamanho === 'G') return 15;
  const n = primeiro.length;
  if (n <= 8) return 16;
  if (n <= 12) return 14;
  if (n <= 16) return 12;
  return 10;
}

// Banda PRETA do código (branco no preto · visual do sistema antigo que a
// equipe conhecia — o código salta aos olhos no salão/portão), com as réguas
// finas em cima/embaixo ecoando a estética de barcode da etiqueta do PCO.
function bandaCodigo(codigo: string, variante?: 'g' | 'cheia'): string {
  const extra = variante === 'g' ? ' codigo-band-g' : variante === 'cheia' ? ' codigo-band-cheia' : '';
  return `<div class="band-wrap">
    <div class="band-rule"></div>
    <div class="codigo-band${extra}">${codigo}</div>
    <div class="band-rule"></div>
  </div>`;
}

// Ícone SVG (não emoji — emoji sai quebrado na Brother). Só a câmera CORTADA:
// aparece quando a criança NÃO tem autorização de imagem (quem autoriza fica com
// a etiqueta limpa · inversão pedida por Marcos/Mari 2026-07-22).
const ICONE_CAMERA_NAO = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="2" y1="2" x2="22" y2="22" stroke-width="2.4"/></svg>`;
// Triângulo de alerta (saúde) · SVG monocromático (emoji quebra na Brother).
const ICONE_ALERTA = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

// Bolo (etiqueta de aniversário) · SVG monocromático (imprime na térmica)
const ICONE_BOLO = `<svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6c1.6 1 1.6 3.2 0 3.8-1.6-.6-1.6-2.8 0-3.8z" fill="#000" stroke="none"/><path d="M32 4c1.6 1 1.6 3.2 0 3.8-1.6-.6-1.6-2.8 0-3.8z" fill="#000" stroke="none"/><path d="M40 6c1.6 1 1.6 3.2 0 3.8-1.6-.6-1.6-2.8 0-3.8z" fill="#000" stroke="none"/><line x1="24" y1="11" x2="24" y2="20"/><line x1="32" y1="9" x2="32" y2="20"/><line x1="40" y1="11" x2="40" y2="20"/><rect x="19" y="20" width="26" height="9" rx="1.5"/><rect x="13" y="29" width="38" height="11" rx="1.5"/><path d="M8 40h48v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/><line x1="6" y1="52" x2="58" y2="52"/></svg>`;

// ⚠️ Emoji em HTML de impressão é loteria (o 📷 saiu como ícone quebrado na
// Brother/preview · Diego 2026-07-08) → só texto puro nos templates de etiqueta.
// Etiqueta PADRÃO da criança · template único (a logo das salas saiu em 2026-07-20).
// A categoria é indicada só pela faixa de cor. Fonte/tamanho vêm da config (CSS).
function htmlEtiquetaCrianca(d: DadosImpressao): string {
  const layout = { ...LAYOUT_ETIQUETA_PADRAO, ...(d.layout || {}) };

  // Saúde em destaque: alergia + necessidade; senão, obs. médica. Trunca em ~24
  // chars (a string começa por ALERGIA → preserva o mais crítico); a tarja preta
  // saiu (ilegível na térmica) e o símbolo de alerta marca a linha (Mari 2026-07-22).
  const saude = [
    d.crianca.alergia ? `ALERGIA: ${d.crianca.alergia}` : '',
    d.crianca.necessidade || '',
    !d.crianca.alergia && !d.crianca.necessidade ? (d.crianca.observacoesMedicas || '') : '',
  ].filter(Boolean).join(' · ');
  const saudeCurta = saude.length > 24 ? saude.slice(0, 23).trimEnd() + '…' : saude;
  const alerta = saude
    ? `<div class="alerta">${ICONE_ALERTA}<span class="alerta-txt">${escapeHtml(saudeCurta)}</span></div>`
    : '';

  // Selo de foto INVERTIDO (Marcos/Mari 2026-07-22): quem AUTORIZA imagem fica com
  // a etiqueta LIMPA (sem selo); quem NÃO autoriza recebe a câmera cortada, bem
  // visível pro voluntário não fotografar. SVG monocromático — nunca texto/emoji.
  const foto = d.crianca.fotoAutorizada ? '' : `<span class="foto-badge">${ICONE_CAMERA_NAO}</span>`;

  // Primeiro nome em destaque + resto menor (nome completo sempre sai).
  const { primeiro, resto } = partesNome(d.crianca.nome);
  const nomePt = fontePrimeiroNome(primeiro, layout.nomeTamanho);

  // Idade em destaque (Milena 2026-07-22 · como no sistema antigo): número
  // grande + legenda. Bebê (<1 ano) mostra os meses ("8m") no lugar do número.
  const anos = d.crianca.idadeAnos;
  const idadeValor = anos != null && anos >= 1 ? String(anos) : (d.crianca.idadeLabel || '—');

  return `<div class="etiqueta" style="--cor:${d.crianca.salaCor || '#EC4899'}">
    <div class="faixa-cor"></div>
    <div class="col-esq">
      ${d.ensaio ? '<div class="ensaio-strip">TESTE / ENSAIO — NÃO VALE COMO PRESENÇA</div>' : ''}
      <div class="topo"><div class="nome-primeiro" style="--nome-pt:${nomePt}">${escapeHtml(primeiro)}</div>${foto}</div>
      ${resto ? `<div class="nome-resto">${escapeHtml(resto)}</div>` : ''}
      <div class="sala">${escapeHtml(d.crianca.salaNome)}</div>
      ${alerta}
    </div>
    <div class="col-idade">
      <div class="idade-num${String(idadeValor).length > 2 ? ' idade-num-p' : ''}">${escapeHtml(idadeValor)}</div>
      <div class="idade-cap">idade</div>
    </div>
    <div class="col-dir col-dir-cheia">
      ${bandaCodigo(d.codigoSeguranca, 'cheia')}
    </div>
  </div>`;
}

// Fragmento da etiqueta de ANIVERSÁRIO (4ª etiqueta · na semana do aniversário)
function htmlEtiquetaAniversario(d: DadosImpressao): string {
  const anos = d.crianca.idadeAnos != null ? d.crianca.idadeAnos : null;
  const idade = anos != null ? `${anos} ano${anos === 1 ? '' : 's'}` : '';
  const logo = d.logoAniversarioUrl
    ? `<img class="aniv-logo" src="${escapeHtml(d.logoAniversarioUrl)}" alt="" />`
    : '<span></span>';
  return `<div class="etiqueta aniv">
    <div class="aniv-banner">FELIZ ANIVERSÁRIO!</div>
    <div class="aniv-row">
      ${logo}
      ${idade ? `<span class="aniv-idade">${escapeHtml(idade)}</span>` : ''}
      <span class="aniv-bolo">${ICONE_BOLO}</span>
    </div>
  </div>`;
}

// Monta o documento final com N fragmentos, um por página. A Brother corta
// entre as páginas → tudo sai em UM job de impressão.
function documento(fragmentos: string[], layout?: EtiquetaLayout): string {
  const corpo = fragmentos.map((f, i) =>
    `<div class="pagina"${i < fragmentos.length - 1 ? ' style="page-break-after:always"' : ''}>${f}</div>`
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cssEtiqueta(layout)}</style></head><body>${corpo}</body></html>`;
}

// Recibo do responsável: por segurança NÃO leva o nome da criança (quem achar
// a etiqueta perdida não descobre de qual criança é) — mostra o nome do
// RESPONSÁVEL; o vínculo com a criança fica só pelo código, no sistema.
function htmlEtiquetaResponsavel(d: DadosImpressao, barcodeSvg: string): string {
  // v2 (Marcos 2026-07-22, depois do teste impresso — o v1 ficou confuso):
  // ESQUERDA = nome do responsável + logo do CBKids + nome do culto;
  // DIREITA = código na banda preta + código de barras, separados pelo divisor
  // tracejado no meio. SEM hora de check-in (ficava pequeno demais). Segue SEM
  // o nome da criança (etiqueta perdida não identifica a criança). A logo é a
  // mesma configurada no admin (logo_aniversario_url · pré-carregada antes de
  // imprimir); sem logo configurada, a linha simplesmente não sai.
  const logo = d.logoAniversarioUrl
    ? `<img class="recibo-logo" src="${escapeHtml(d.logoAniversarioUrl)}" alt="" />`
    : '';
  return `<div class="etiqueta">
    <div class="col-esq" style="padding-left:0">
      ${d.ensaio ? '<div class="ensaio-strip">TESTE / ENSAIO — NÃO VALE COMO PRESENÇA</div>' : ''}
      <div class="recibo-nome">${escapeHtml(nomeParaEtiqueta(d.responsavel.nome))}</div>
      ${logo}
      <div class="recibo-culto">${escapeHtml(d.cultoDiaHora || d.crianca.salaNome)}</div>
      <div class="recibo-hint">Apresente este código para buscar</div>
    </div>
    <div class="col-dir recibo-dir">
      ${bandaCodigo(d.codigoSeguranca, 'g')}
      <div class="barcode-area">${barcodeSvg}</div>
    </div>
  </div>`;
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

type ResultadoImpressao = { status: 'enviada' | 'sucesso' };

function imprimirHtml(html: string, preview = false): Promise<ResultadoImpressao> {
  if (preview) {
    // Modo preview · abre popup visível pro usuário conferir layout antes de
    // ir pra impressora. Útil pra teste/debug. Janela um pouco maior que
    // a etiqueta real (90x29mm ~ 340x110px paisagem) com margem pra borda.
    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=480,height=200,scrollbars=yes');
      if (!win) {
        throw new Error('Popup bloqueado · libere popups do sistema para visualizar a etiqueta');
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      resolve({ status: 'sucesso' });
    });
  }
  return new Promise((resolve, reject) => {
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
      reject(new Error('O navegador não conseguiu preparar a impressão'));
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    // Delay pra fontes + barcode SVG renderizarem
    setTimeout(() => {
      let finalizado = false;
      const concluir = (status: ResultadoImpressao['status']) => {
        if (finalizado) return;
        finalizado = true;
        try { document.body.removeChild(iframe); } catch { /* já removido */ }
        resolve({ status });
      };
      try {
        // `afterprint` é a melhor confirmação disponível no navegador: indica
        // que o job saiu do diálogo/kiosk e foi aceito pelo fluxo de impressão.
        // A Brother física ainda deve ser conferida pelo operador.
        iframe.contentWindow?.addEventListener('afterprint', () => concluir('sucesso'), { once: true });
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('[totemKids/imprimir] erro print:', e);
        try { document.body.removeChild(iframe); } catch { /* já removido */ }
        reject(new Error(`Falha ao enviar para a impressora: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }
      // Alguns modos kiosk não disparam afterprint. Nesse caso registramos só
      // "enviada", sem afirmar sucesso que o browser não confirmou.
      setTimeout(() => concluir('enviada'), 4000);
    }, 400);
  });
}

// HTML da etiqueta da criança pra PRÉVIA na tela (iframe srcDoc). Sem barcode
// (a etiqueta da criança não tem) — reflete logo + layout escolhidos.
export function gerarHtmlPreviewCrianca(d: DadosImpressao): string {
  return documento([htmlEtiquetaCrianca(d)], d.layout);
}

// PRÉVIA da etiqueta de aniversário (iframe srcDoc)
export function gerarHtmlPreviewAniversario(d: DadosImpressao): string {
  return documento([htmlEtiquetaAniversario(d)], d.layout);
}

// API pública · imprime TODAS as etiquetas em UM job (a Brother corta entre elas).
// preview=true abre num popup ao inves de mandar pra impressora.
// incluirRecibo (default true · preserva o comportamento individual): quando false,
// imprime SÓ as 2 etiquetas da criança, sem o recibo do responsável. Usado no
// check-in de família (mesmo responsável + mesmo código): o recibo é genérico
// (responsável + código, sem nome de criança) → 1 só basta pra todos os filhos, e o
// pai não fica com N recibos pra perder (Marcos 2026-07-16). Layout/texto inalterados.
export async function imprimirEtiquetas(d: DadosImpressao, preview = false, incluirRecibo = true): Promise<void> {
  const [barcodeSvg] = await Promise.all([
    gerarBarcodeSvg(d.codigoBarras),
    // Logo do CBKids sai no recibo (v2) e na etiqueta de aniversário —
    // pré-carrega sempre que houver (preloadImg tolera null e não trava).
    preloadImg(d.logoAniversarioUrl),
  ]);

  // Etiqueta de aniversário: máximo 2 por semana de aniversário (Milena
  // 2026-07-22 · antes saía Qua + Dom manhã + Dom noite = 3). O backend conta os
  // check-ins da criança na janela do aniversário (já inclui o atual, pois a
  // impressão roda após o POST) e diz se ainda pode. Fail-open: se a checagem
  // falhar, imprime (não perde o aniversário). Só no check-in — a reimpressão
  // repete o que estava na etiqueta.
  let comAniversario = !!d.crianca.aniversarioSemana;
  if (comAniversario && d.criancaId) {
    try {
      const r = await totemKids.criancas.aniversarioImpressoes(d.criancaId);
      comAniversario = r?.imprimir !== false;
    } catch { /* fail-open */ }
  }

  // No CHECK-IN: 2 etiquetas da criança (uma na criança, outra na sacola/
  // pertences) + 1 do responsável (recibo) + 1 de aniversário (na semana).
  const fragCrianca = htmlEtiquetaCrianca(d);
  const fragmentos = [fragCrianca, fragCrianca];
  if (incluirRecibo) fragmentos.push(htmlEtiquetaResponsavel(d, barcodeSvg));
  if (comAniversario) fragmentos.push(htmlEtiquetaAniversario(d));

  const resultado = await imprimirHtml(documento(fragmentos, d.layout), preview);
  if (preview) return;  // não loga impressão em modo preview

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
      aniversario: comAniversario,
    },
    status: resultado.status,
  }).catch(() => {});
  if (incluirRecibo) {
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'responsavel',
      conteudo: { crianca: d.crianca.nome, sala: d.crianca.salaNome, codigo: d.codigoSeguranca },
      status: resultado.status,
    }).catch(() => {});
  }
}

// Reimpressao (etiqueta rasgou ou impressora falhou) — 1 etiqueta, 1 job.
export async function reimprimirEtiqueta(d: DadosImpressao, tipo: 'crianca' | 'responsavel', motivo: string): Promise<void> {
  const [barcodeSvg] = await Promise.all([
    gerarBarcodeSvg(d.codigoBarras),
    tipo === 'responsavel' ? preloadImg(d.logoAniversarioUrl) : Promise.resolve(),
  ]);
  const frag = tipo === 'crianca' ? htmlEtiquetaCrianca(d) : htmlEtiquetaResponsavel(d, barcodeSvg);
  const resultado = await imprimirHtml(documento([frag], d.layout));
  totemKids.etiquetas.log({
    checkin_id: d.checkinId,
    estacao_id: d.estacaoId,
    tipo,
    conteudo: { nome: d.crianca.nome, codigo: d.codigoSeguranca },
    reimpressao: true,
    motivo_reimpressao: motivo,
    status: resultado.status,
  }).catch(() => {});
}

// Reimpressão COMPLETA: repete exatamente o conjunto operacional do check-in
// (2 etiquetas da criança + recibo do responsável + aniversário, se houver),
// preservando o mesmo código de segurança e sem criar novo check-in.
export async function reimprimirEtiquetasCompletas(d: DadosImpressao, motivo: string): Promise<void> {
  const [barcodeSvg] = await Promise.all([
    gerarBarcodeSvg(d.codigoBarras),
    preloadImg(d.crianca.salaLogoUrl),
    preloadImg(d.logoAniversarioUrl),
  ]);
  const fragCrianca = htmlEtiquetaCrianca(d, barcodeSvg);
  const fragmentos = [fragCrianca, fragCrianca, htmlEtiquetaResponsavel(d, barcodeSvg)];
  if (d.crianca.aniversarioSemana) fragmentos.push(htmlEtiquetaAniversario(d));
  const resultado = await imprimirHtml(documento(fragmentos));
  await Promise.all([
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'crianca',
      conteudo: { nome: d.crianca.nome, codigo: d.codigoSeguranca, copias: 2, completa: true },
      reimpressao: true,
      motivo_reimpressao: motivo,
      status: resultado.status,
    }),
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'responsavel',
      conteudo: { nome: d.responsavel.nome, codigo: d.codigoSeguranca, completa: true },
      reimpressao: true,
      motivo_reimpressao: motivo,
      status: resultado.status,
    }),
  ]).catch(() => {});
}
