// ════════════════════════════════════════════════════════════════════════════
//  Curva de audiência da transmissão (aba Online).
//
//  Pedido do Matheus (02/09/2026): "me explique esse gráfico de retenção e
//  melhore ele, pois não dá pra entender muito bem."
//
//  ⚠️⚠️ O QUE A MÉTRICA É — e o que ela NÃO é. O comentário em
//  `youtubeAnalytics.js` dizia "audienceWatchRatio = % dos viewers ainda
//  assistindo no ponto". **Está errado**, e era a origem da confusão. O
//  `audienceWatchRatio` do YouTube é
//
//      visualizações DAQUELE trecho ÷ visualizações totais do vídeo
//
//  Não é uma curva de sobrevivência. Uma curva de "quantos ainda estão aqui"
//  só pode CAIR — quem saiu não volta. Esta **sobe**, porque quem entra na
//  transmissão depois do começo (ou pula a espera no replay) é contado a
//  partir do ponto em que entrou. Pode inclusive passar de 1,0 num trecho
//  reassistido.
//
//  ⚠️ POR ISSO O EIXO MUDOU DE "% DO VÍDEO" PARA MINUTOS. "32% do vídeo" não
//  diz nada a quem produz o culto; "24 min de transmissão" diz. A duração vem
//  de `actual_start_time`/`actual_end_time`; sem elas, cai de volta para %.
//
//  ⚠️ A ABERTURA. Medido no culto de 26/08/2026 (1h16): a curva vale 0,77 em 1%,
//  despenca para 0,06 em 5% e só então sobe até um platô de ~0,45, que segura
//  até 90%. Aquele vale não é fuga de audiência — é a tela de espera antes do
//  culto começar. Tratá-lo como queda faz a transmissão parecer um desastre
//  quando ela na verdade tem platô estável.
// ════════════════════════════════════════════════════════════════════════════

export type PontoCurva = { ratio_pct: number; audience_watch_ratio: number };

export type CurvaLida = {
  pontos: { x: number; y: number }[];
  /** Fim do eixo X. */
  max: number;
  /** true quando o eixo está em minutos (duração conhecida). */
  emMinutos: boolean;
  /** Média da audiência DEPOIS da abertura — a régua honesta. */
  media: number;
  pico: number;
  picoX: number;
  /** Audiência no último ponto. */
  fim: number;
  /** Posição no eixo onde o culto de fato começa (fim da abertura). */
  inicioCulto: number | null;
  /** Rótulo da abertura, ex. "os 4 primeiros min". `null` se não houver. */
  abertura: string | null;
  fmtEixo: (v: number) => string;
  fmtRotulo: (v: number) => string;
};

const VAZIA: CurvaLida = {
  pontos: [], max: 100, emMinutos: false, media: 0, pico: 0, picoX: 0, fim: 0,
  inicioCulto: null, abertura: null,
  fmtEixo: (v) => `${v}%`, fmtRotulo: (v) => `${v}% do vídeo`,
};

/**
 * ⚠️ A abertura só é reconhecida quando a curva **desce e volta a subir de
 * verdade**. Sem essa exigência, um vídeo que só decai (o formato normal) teria
 * seu mínimo declarado "abertura" e a tela mentiria com uma linha amarela.
 *
 * Regra: o vale precisa estar no primeiro terço E a curva precisa depois
 * alcançar pelo menos o dobro do vale. No culto medido, o vale é 0,06 e o platô
 * 0,46 — quase 8×, bem acima do corte.
 */
export function acharAbertura(pontos: PontoCurva[]): number | null {
  if (pontos.length < 6) return null;
  const limite = Math.floor(pontos.length / 3);
  let iVale = 0;
  for (let i = 1; i <= limite; i++) {
    if (pontos[i].audience_watch_ratio < pontos[iVale].audience_watch_ratio) iVale = i;
  }
  const vale = pontos[iVale].audience_watch_ratio;
  if (iVale === 0 || vale <= 0) return null;
  let depois = 0;
  for (let i = iVale + 1; i < pontos.length; i++) {
    if (pontos[i].audience_watch_ratio > depois) depois = pontos[i].audience_watch_ratio;
  }
  return depois >= vale * 2 ? iVale : null;
}

export function lerCurva(
  curva: PontoCurva[] | null | undefined,
  duracaoMinutos?: number | null,
): CurvaLida {
  if (!Array.isArray(curva) || curva.length === 0) return VAZIA;
  const pts = [...curva]
    .filter((p) => Number.isFinite(p?.ratio_pct) && Number.isFinite(p?.audience_watch_ratio))
    .sort((a, b) => a.ratio_pct - b.ratio_pct);
  if (pts.length === 0) return VAZIA;

  const emMinutos = Number.isFinite(duracaoMinutos as number) && (duracaoMinutos as number) > 0;
  const dur = emMinutos ? (duracaoMinutos as number) : 100;
  const emX = (pct: number) => (emMinutos ? (pct / 100) * dur : pct);

  const pontos = pts.map((p) => ({ x: emX(p.ratio_pct), y: p.audience_watch_ratio }));

  const iAbertura = acharAbertura(pts);
  const inicioCulto = iAbertura != null ? emX(pts[iAbertura].ratio_pct) : null;

  // ⚠️ A média ignora a abertura de propósito. Incluí-la mistura a tela de
  // espera com o culto e produz um número que não descreve nem um nem outro.
  const doCulto = iAbertura != null ? pts.slice(iAbertura) : pts;
  const media = doCulto.reduce((s, p) => s + p.audience_watch_ratio, 0) / doCulto.length;

  let iPico = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].audience_watch_ratio > pts[iPico].audience_watch_ratio) iPico = i;
  }

  const fmtMin = (v: number) => {
    const m = Math.round(v);
    return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
  };
  const fmtEixo = emMinutos ? fmtMin : (v: number) => `${Math.round(v)}%`;
  const fmtRotulo = emMinutos
    ? (v: number) => `${fmtMin(v)} de transmissão`
    : (v: number) => `${Math.round(v)}% do vídeo`;

  return {
    pontos,
    max: emMinutos ? dur : 100,
    emMinutos,
    media,
    pico: pts[iPico].audience_watch_ratio,
    picoX: emX(pts[iPico].ratio_pct),
    fim: pts[pts.length - 1].audience_watch_ratio,
    inicioCulto,
    abertura: inicioCulto != null
      ? (emMinutos ? `os ${Math.round(inicioCulto)} primeiros min` : `os primeiros ${Math.round(inicioCulto)}%`)
      : null,
    fmtEixo,
    fmtRotulo,
  };
}
