// A série do canal e as fontes de tráfego do /online.
//
// ⚠️⚠️ O QUE ESTE ARQUIVO TRAVA, e é o motivo de a régua existir: medido em
// produção (22/09/2026), `online_canal_snapshot` é imprestável como série —
// `subscriber_count` tem **6 valores distintos em 90 dias** (o YouTube
// arredonda) e `view_count` **caiu em 25 dos 90** (revisão para baixo). Um
// gráfico derivado dali desenharia degraus e dias NEGATIVOS. A série vem de
// `online_canal_views_dia`, que é a Analytics por dia.
import { describe, it, expect } from 'vitest';
const {
  normalizarPeriodo, janelaDoPeriodo, montarSerie, agregarTrafego,
  PERIODOS, PERIODO_PADRAO, hojeBRT,
} = require('../../backend/utils/canalSerie');

function comFuso<T>(tz: string, fn: () => T): T {
  const antes = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
  }
}

describe('normalizarPeriodo · fail-safe, nunca data inválida', () => {
  it('aceita os períodos que a tela oferece', () => {
    for (const p of PERIODOS) expect(normalizarPeriodo(p)).toBe(p);
    expect(normalizarPeriodo('28')).toBe(28);
  });

  it('⚠️⚠️ valor torto cai no padrão, NUNCA em NaN', () => {
    // `Number('abc')` é NaN, e NaN em aritmética de data vira "NaN-NaN-NaN",
    // que o PostgREST recusa — o endpoint inteiro viraria 500 por causa de um
    // query param. (Mesma lição de `resolverJanelaPeriodo`, 02/09.)
    for (const ruim of ['abc', '', null, undefined, NaN, Infinity, -7, 0, 9999, {}, []]) {
      expect(normalizarPeriodo(ruim as any)).toBe(PERIODO_PADRAO);
    }
  });
});

describe('janelaDoPeriodo · dia em BRT', () => {
  it('a janela tem exatamente o número de dias pedido, contando hoje', () => {
    const j = janelaDoPeriodo(7, Date.parse('2026-09-22T15:00:00Z'));
    expect(j.fim).toBe('2026-09-22');
    expect(j.inicio).toBe('2026-09-16'); // 16..22 = 7 dias
    expect(j.dias).toBe(7);
  });

  it('⚠️⚠️ 23h no Rio ainda é HOJE — em UTC já seria amanhã', () => {
    comFuso('America/Sao_Paulo', () => {
      // 23/09 02:00 UTC = 22/09 23:00 BRT
      expect(hojeBRT(Date.parse('2026-09-23T02:00:00Z'))).toBe('2026-09-22');
      expect(janelaDoPeriodo(28, Date.parse('2026-09-23T02:00:00Z')).fim).toBe('2026-09-22');
    });
  });

  it('período inválido produz janela válida, não quebrada', () => {
    const j = janelaDoPeriodo('xyz' as any, Date.parse('2026-09-22T15:00:00Z'));
    expect(j.dias).toBe(PERIODO_PADRAO);
    expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.inicio < j.fim).toBe(true);
  });
});

describe('montarSerie · ausência nunca vira zero', () => {
  const janela = { inicio: '2026-09-16', fim: '2026-09-22', dias: 7 };
  const linhas = [
    { data: '2026-09-15', views: 999, watch_minutos: 600 },  // fora
    { data: '2026-09-16', views: 1327, watch_minutos: 6000 },
    { data: '2026-09-17', views: 766, watch_minutos: 3000 },
    { data: '2026-09-19', views: 1043, watch_minutos: 4200 },
  ];

  it('soma só o que está na janela e converte minutos em horas', () => {
    const r = montarSerie(linhas, janela);
    expect(r.total_views).toBe(1327 + 766 + 1043);
    expect(r.total_horas).toBe(100 + 50 + 70);
    expect(r.dias_com_dado).toBe(3);
  });

  it('⚠️⚠️ dia sem coleta NÃO vira ponto zero', () => {
    // Zero desenharia um vale que não existiu — e a ponta da série é
    // justamente onde a Analytics ainda não fechou.
    const r = montarSerie(linhas, janela);
    expect(r.pontos.map((p: any) => p.data)).toEqual(['2026-09-16', '2026-09-17', '2026-09-19']);
    expect(r.pontos.some((p: any) => p.views === 0)).toBe(false);
  });

  it('⚠️ sem nenhum dia, o total é NULL e não 0', () => {
    const r = montarSerie([], janela);
    expect(r.total_views).toBeNull();
    expect(r.total_horas).toBeNull();
    expect(r.dias_com_dado).toBe(0);
    expect(r.ultimo_dia).toBeNull();
  });

  it('declara o último dia fechado (a ponta confiável do gráfico)', () => {
    expect(montarSerie(linhas, janela).ultimo_dia).toBe('2026-09-19');
  });

  it('ordena por data mesmo se vier fora de ordem', () => {
    const r = montarSerie([...linhas].reverse(), janela);
    expect(r.pontos[0].data).toBe('2026-09-16');
  });

  it('entrada inválida não derruba', () => {
    expect(montarSerie(null as any, janela).total_views).toBeNull();
    const r = montarSerie([{ data: '2026-09-17', views: 'x' } as any], janela);
    expect(r.pontos[0].views).toBeNull();
    expect(r.total_views).toBeNull();   // nenhuma linha com número
    expect(r.dias_com_dado).toBe(1);    // ...mas a linha VEIO
  });

  it('watch ausente não vira zero hora', () => {
    const r = montarSerie([{ data: '2026-09-17', views: 50 }], janela);
    expect(r.total_views).toBe(50);
    expect(r.total_horas).toBeNull();
  });
});

describe('agregarTrafego · a soma fecha 100%', () => {
  // Números REAIS de produção (ago/set 2026).
  const reais = [
    { video_id: 'a', fonte: 'SUBSCRIBER', views: 26938 },
    { video_id: 'a', fonte: 'YT_SEARCH', views: 7307 },
    { video_id: 'b', fonte: 'YT_CHANNEL', views: 5458 },
    { video_id: 'b', fonte: 'RELATED_VIDEO', views: 4330 },
    { video_id: 'c', fonte: 'EXT_URL', views: 2193 },
    { video_id: 'c', fonte: 'NOTIFICATION', views: 1420 },
    { video_id: 'd', fonte: 'NO_LINK_OTHER', views: 1317 },
    { video_id: 'd', fonte: 'YT_OTHER_PAGE', views: 1201 },
    { video_id: 'e', fonte: 'SHORTS', views: 346 },
    { video_id: 'e', fonte: 'PLAYLIST', views: 109 },
  ];

  it('ordena por views e traduz o rótulo', () => {
    const r = agregarTrafego(reais);
    expect(r.itens[0].rotulo).toBe('Inscritos');
    expect(r.itens[0].views).toBe(26938);
    expect(r.itens[1].rotulo).toBe('Busca no YouTube');
  });

  it('⚠️⚠️ a CAUDA vira uma fatia declarada — a soma tem que fechar', () => {
    // É a lei do corte de bairro do censo (16/09): esconder a cauda faz quem
    // soma as fatias concluir que falta view.
    const r = agregarTrafego(reais, { topo: 3 });
    const soma = r.itens.reduce((s: number, i: any) => s + i.views, 0);
    expect(soma).toBe(r.total);
    const outras = r.itens.find((i: any) => i.fonte === '_outras');
    expect(outras).toBeTruthy();
    expect(outras.rotulo).toContain('7');   // 10 fontes - 3 = 7 na cauda
  });

  it('os percentuais somam ~100', () => {
    const r = agregarTrafego(reais);
    const pct = r.itens.reduce((s: number, i: any) => s + i.pct, 0);
    expect(pct).toBeGreaterThan(99.5);
    expect(pct).toBeLessThan(100.5);
  });

  it('⚠️ fonte DESCONHECIDA não é descartada — vira o próprio código', () => {
    // O YouTube acrescenta tipo novo sem avisar; descartar faria a soma não
    // fechar em silêncio.
    const r = agregarTrafego([{ video_id: 'z', fonte: 'FONTE_NOVA_DO_YT', views: 100 }]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].rotulo).toBe('FONTE_NOVA_DO_YT');
    expect(r.total).toBe(100);
  });

  it('⚠️ declara em quantos VÍDEOS a base se apoia (não é o canal inteiro)', () => {
    // A Analytics é consultada por vídeo; sem a base declarada alguém lê como
    // se fosse o tráfego do canal.
    expect(agregarTrafego(reais).videos).toBe(5);
  });

  it('⚠️ sem dado devolve total NULL, nunca 0', () => {
    expect(agregarTrafego([]).total).toBeNull();
    expect(agregarTrafego(null as any).total).toBeNull();
    expect(agregarTrafego([{ fonte: 'X', views: 0 } as any]).total).toBeNull();
  });

  it('soma a mesma fonte de vídeos diferentes', () => {
    const r = agregarTrafego([
      { video_id: 'a', fonte: 'SUBSCRIBER', views: 100 },
      { video_id: 'b', fonte: 'SUBSCRIBER', views: 50 },
    ]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].views).toBe(150);
    expect(r.videos).toBe(2);
  });
});
