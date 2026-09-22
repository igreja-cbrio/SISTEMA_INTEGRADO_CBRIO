// ════════════════════════════════════════════════════════════════════════════
//  A série do canal e as fontes de tráfego · régua PURA
//
//  Alimenta o gráfico do canal e a rosca de "de onde vêm as views" no /online.
//
//  ⚠️⚠️ POR QUE A SÉRIE NÃO SAI DE `online_canal_snapshot` (medido em 22/09/2026)
//
//  O snapshot guarda o ACUMULADO do canal (`subscriber_count`, `view_count`), e
//  os dois são imprestáveis como série diária:
//
//    · `subscriber_count` tem **6 valores distintos em 90 dias** (26.700 →
//      27.200, em degraus de 100) — o YouTube ARREDONDA a contagem pública.
//      Uma sparkline disso é uma escada, não uma tendência.
//    · `view_count` **CAIU em 25 dos 90 dias** — o YouTube revisa o acumulado
//      para baixo ao depurar. Derivar "views do dia" subtraindo dois snapshots
//      produziria dias NEGATIVOS.
//
//  ⇒ A série vem de `online_canal_views_dia`, que é a Analytics por DIA (a
//  mesma fonte do card da semana). Ela tem `views` e `watch_minutos`.
//
//  ⚠️ E ela está sempre alguns dias atrás: o YouTube fecha o dia com atraso.
//  Por isso `cobertura` volta junto — quem lê o gráfico precisa saber que a
//  ponta direita ainda vai subir, senão lê queda onde há só coleta pendente.
// ════════════════════════════════════════════════════════════════════════════

/** Períodos que a tela oferece. ⚠️ Mudou aqui, muda o seletor — valor fora
 *  desta lista cai no default em vez de virar data inválida. */
const PERIODOS = Object.freeze([7, 28, 90]);
const PERIODO_PADRAO = 28;

/**
 * Normaliza o período pedido. ⚠️ FAIL-SAFE, nunca fail-open: `Number('abc')`
 * é NaN e NaN em aritmética de data produz `"NaN-NaN-NaN"`, que o PostgREST
 * recusa — o endpoint inteiro viraria 500 por causa de um query param torto.
 * (É a mesma lição de `resolverJanelaPeriodo`, 02/09.)
 */
function normalizarPeriodo(bruto) {
  const n = Number(bruto);
  return PERIODOS.includes(n) ? n : PERIODO_PADRAO;
}

/** Dia de HOJE em BRT. ⚠️ `toISOString()` sobre o agora dá o dia UTC, e das
 *  21h do Rio em diante ele já virou — a janela começaria um dia adiantada. */
function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A janela [inicio, fim] do período, em dia BRT, fim = hoje. */
function janelaDoPeriodo(dias, agora = Date.now()) {
  const d = normalizarPeriodo(dias);
  const fim = hojeBRT(agora);
  const inicio = new Date(Date.parse(`${fim}T12:00:00Z`) - (d - 1) * 86400000)
    .toISOString().slice(0, 10);
  return { dias: d, inicio, fim };
}

/**
 * Monta a série diária para o gráfico.
 *
 * ⚠️ Dia sem coleta NÃO é preenchido com zero: ele simplesmente não entra.
 * Zero desenharia um vale que não existiu — e a ponta da série é justamente
 * onde a Analytics ainda não fechou. `cobertura` é o que permite a tela
 * declarar isso.
 */
function montarSerie(linhas, janela) {
  const dentro = (Array.isArray(linhas) ? linhas : [])
    .map((l) => ({
      data: typeof l?.data === 'string' ? l.data.slice(0, 10) : null,
      views: Number.isFinite(Number(l?.views)) ? Number(l.views) : null,
      // ⚠️ minutos → HORAS na régua, não na tela: duas telas dividindo por 60
      // por conta própria divergem no primeiro arredondamento.
      horas: Number.isFinite(Number(l?.watch_minutos))
        ? Math.round(Number(l.watch_minutos) / 60)
        : null,
    }))
    .filter((l) => l.data && l.data >= janela.inicio && l.data <= janela.fim)
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  const comViews = dentro.filter((l) => l.views !== null);
  const totalViews = comViews.reduce((s, l) => s + l.views, 0);
  const comHoras = dentro.filter((l) => l.horas !== null);
  const totalHoras = comHoras.reduce((s, l) => s + l.horas, 0);

  return {
    pontos: dentro,
    // ⚠️ Sem NENHUM dia coletado o total é NULL, nunca 0: "não coletamos" e
    // "ninguém assistiu" levam a decisões opostas.
    total_views: comViews.length ? totalViews : null,
    total_horas: comHoras.length ? totalHoras : null,
    dias_com_dado: dentro.length,
    // Último dia que a Analytics fechou — é o que a tela usa para dizer até
    // quando o gráfico é confiável.
    ultimo_dia: dentro.length ? dentro[dentro.length - 1].data : null,
  };
}

/** Rótulos em português das fontes de tráfego do YouTube. */
const FONTE_ROTULO = Object.freeze({
  SUBSCRIBER: 'Inscritos',
  YT_SEARCH: 'Busca no YouTube',
  YT_CHANNEL: 'Página do canal',
  RELATED_VIDEO: 'Vídeos sugeridos',
  EXT_URL: 'Links de fora',
  NOTIFICATION: 'Notificação',
  PLAYLIST: 'Playlist',
  SHORTS: 'Shorts',
  YT_OTHER_PAGE: 'Outras páginas do YT',
  NO_LINK_OTHER: 'Direto / sem origem',
  NO_LINK_EMBEDDED: 'Player incorporado',
  IMMERSIVE_LIVE: 'Ao vivo em destaque',
  END_SCREEN: 'Tela final',
  ANNOTATION: 'Card do vídeo',
  HASHTAGS: 'Hashtag',
  SOUND_PAGE: 'Página de som',
  CAMPAIGN_CARD: 'Campanha',
  ADVERTISING: 'Anúncio',
  PROMOTED: 'Promovido',
});

/**
 * Agrega as fontes de tráfego e devolve o topo, com o resto somado.
 *
 * ⚠️⚠️ Esta é a fatia dos VÍDEOS que têm coleta de tráfego, **não do canal
 * inteiro** — a Analytics é consultada por vídeo (`filters: video==`). Quem
 * mostra este número TEM que declarar a base, senão alguém soma e conclui que
 * falta view. Por isso `videos` volta junto.
 *
 * ⚠️ Fonte desconhecida NÃO é descartada: o YouTube acrescenta tipo novo sem
 * avisar, e descartar faria a soma não fechar em silêncio. Vira o próprio
 * código, que é feio e verdadeiro.
 */
function agregarTrafego(linhas, { topo = 6 } = {}) {
  const porFonte = new Map();
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const fonte = typeof l?.fonte === 'string' ? l.fonte.trim() : '';
    const views = Number(l?.views);
    if (!fonte || !Number.isFinite(views) || views <= 0) continue;
    porFonte.set(fonte, (porFonte.get(fonte) || 0) + views);
  }

  const total = [...porFonte.values()].reduce((s, v) => s + v, 0);
  if (!total) return { itens: [], total: null, videos: 0 };

  const ordenado = [...porFonte.entries()]
    .map(([fonte, views]) => ({
      fonte,
      rotulo: FONTE_ROTULO[fonte] || fonte,
      views,
      pct: Number(((views / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.views - a.views);

  const itens = ordenado.slice(0, topo);
  const resto = ordenado.slice(topo);
  if (resto.length) {
    // ⚠️ A cauda vira UMA fatia declarada, nunca some: a soma tem que fechar
    // 100% — é a lei do corte de bairro do censo (16/09).
    const views = resto.reduce((s, r) => s + r.views, 0);
    itens.push({
      fonte: '_outras',
      rotulo: `Outras (${resto.length})`,
      views,
      pct: Number(((views / total) * 100).toFixed(1)),
    });
  }

  const videos = new Set(
    (Array.isArray(linhas) ? linhas : [])
      .map((l) => l?.video_id)
      .filter(Boolean),
  ).size;

  return { itens, total, videos };
}

module.exports = {
  PERIODOS,
  PERIODO_PADRAO,
  normalizarPeriodo,
  hojeBRT,
  janelaDoPeriodo,
  montarSerie,
  agregarTrafego,
  FONTE_ROTULO,
};
