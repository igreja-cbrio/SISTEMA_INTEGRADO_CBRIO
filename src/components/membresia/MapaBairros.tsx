// Onde a membresia mora · MAPA DE CALOR por bairro (+ círculo com o número).
//
// ⚠️⚠️ AGREGADO POR BAIRRO, e isso é a decisão de produto (Matheus, 23/08),
// não uma limitação técnica. Endereço de pessoa NUNCA sai do servidor: o
// endpoint devolve bairro + centróide + contagem, e nada mais. É isso que
// permite abrir esta tela para líder de área sem abrir o cadastro junto.
//
// ⚠️ O centróide vem de `dem_bairro_geo`, tabela PRÓPRIA — `mem_membros.lat/lng`
// segue reservado para acerto de rua. É a lição do `pinosMapa.ts` (31/07):
// gravar centróide de bairro na coordenada da pessoa destrói para sempre a
// distinção entre endereço real e chute, e ninguém percebe depois.
//
// ⚠️⚠️ TUDO AQUI É CAMADA NATIVA DO MAPLIBRE (source + layer), nunca marcador
// DOM. Não é preferência de estilo: a versão com `MapMarker` ficou com ZERO
// pinos em produção (medido em 23/08/2026, no navegador) porque o React monta
// um portal DENTRO do nó que o maplibre remove do documento — o desmonte
// estoura `removeChild` e derruba a tela inteira de marcadores. Camada nativa
// não tem nó de React envolvido, então a classe de bug deixa de existir. O
// `ui/map.tsx` foi consertado na mesma leva (nó interno próprio), mas aqui o
// calor pede camada nativa de qualquer forma.
//
// ⚠️ Bairro sem centróide NÃO some em silêncio: quem chama recebe
// `pessoas_fora_do_mapa` e mostra ao lado. Mapa que esconde o próprio buraco é
// pior que mapa vazio — quem olha conclui que a igreja inteira mora ali.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import MapLibreGL from 'maplibre-gl';
import { Map, MapControls, useMap } from '@/components/ui/map';
import { nucleoDoMapa } from '@/lib/nucleoMapaBairros';

export { nucleoDoMapa };

export type BairroMapa = {
  bairro: string;
  norm: string;
  total: number;
  lat: number;
  lng: number;
};

const SRC = 'dem-bairros';
const L_CALOR = 'dem-bairros-calor';
const L_CIRCULO = 'dem-bairros-circulo';
const L_NUMERO = 'dem-bairros-numero';

// ⚠️ Diagnóstico OPT-IN (`?diagmapa=1` na URL). Existe porque este mapa já
// falhou TRÊS vezes em produção sem emitir uma linha de console — e sem sinal
// nenhum a investigação vira chute. Não liga nada sozinho.
const DIAG = typeof location !== 'undefined' && location.search.includes('diagmapa=1');
// ⚠️ Loga STRING, não objeto: o objeto aparece como "Object" em ferramenta de
// leitura de console e some justamente o dado que importa.
const diag = (msg: string, extra?: Record<string, unknown>) => {
  if (!DIAG) return;
  const cauda = extra ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${String(v)}`).join(' ') : '';
  console.info(`[mapa-bairros] ${msg}${cauda}`);
};

const TEAL = '#00B39D';
const TEAL_SUAVE = 'rgba(0,179,157,0.62)';

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function montarGeoJson(bairros: BairroMapa[], total: number) {
  const maior = Math.max(1, ...bairros.map((b) => b.total));
  return {
    type: 'FeatureCollection' as const,
    features: bairros.map((b) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [b.lng, b.lat] },
      properties: {
        norm: b.norm,
        bairro: b.bairro,
        total: b.total,
        // ⚠️ Peso pela RAIZ, não pelo total cru: com um bairro de 55 e o resto
        // entre 1 e 7, o peso linear apagaria todos os outros do calor e o mapa
        // diria que a igreja mora num bairro só.
        peso: Math.sqrt(b.total / maior),
        pct: total > 0 ? Math.round((b.total / total) * 100) : 0,
      },
    })),
  };
}

function Enquadrar({ bairros, tudo }: { bairros: BairroMapa[]; tudo: boolean }) {
  const { map, isLoaded } = useMap();
  const alvo = useMemo(
    () => (tudo ? bairros : nucleoDoMapa(bairros).nucleo),
    [bairros, tudo],
  );
  // A chave só muda quando o CONJUNTO de pontos muda — sem ela, cada render
  // do pai reenquadraria o mapa e a pessoa não conseguiria dar zoom.
  const chave = alvo.map((b) => b.norm).sort().join('|');
  useEffect(() => {
    if (!isLoaded || !map || alvo.length === 0) return;
    if (alvo.length === 1) {
      map.flyTo({ center: [alvo[0].lng, alvo[0].lat], zoom: 13, duration: 600 });
      return;
    }
    const lats = alvo.map((b) => b.lat);
    const lngs = alvo.map((b) => b.lng);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 64, duration: 600, maxZoom: 13 },
    );
    // `chave` é a dependência real; `alvo` muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, isLoaded, map]);
  return null;
}

function Camadas({
  bairros,
  totalNoMapa,
  selecionado,
  onSelecionar,
}: {
  bairros: BairroMapa[];
  totalNoMapa: number;
  selecionado?: string | null;
  onSelecionar?: (norm: string | null) => void;
}) {
  const { map, isLoaded } = useMap();
  const dados = useMemo(() => montarGeoJson(bairros, totalNoMapa), [bairros, totalNoMapa]);

  // Refs para os handlers lerem o estado ATUAL sem recriar os listeners a cada
  // render — recriar listener de mapa é como se perde clique.
  const dadosRef = useRef(dados);
  dadosRef.current = dados;
  const selRef = useRef<string | null>(selecionado ?? null);
  selRef.current = selecionado ?? null;
  const onSelRef = useRef(onSelecionar);
  onSelRef.current = onSelecionar;

  useEffect(() => {
    // ⚠️⚠️ Depende só do MAPA, nunca de `isLoaded`. O efeito precisa REGISTRAR
    // os gatilhos (`styledata`/`idle`/`load`) o quanto antes: se ele esperar
    // `isLoaded`, existe a janela em que o mapa já existe, o estilo termina de
    // carregar e NINGUÉM está escutando — o basemap desenha e as camadas nunca
    // nascem, sem erro no console. Foi exatamente o que aconteceu em produção
    // (23/08/2026). Quem decide a hora certa de criar a camada é o
    // `map.isStyleLoaded()` dentro do `aplicar`, que roda a cada gatilho.
    if (!map) return;
    let vivo = true;
    diag('effect montou', { isLoaded });

    const pintarSelecao = () => {
      if (!map.getLayer(L_CIRCULO)) return;
      const sel = selRef.current ?? ' ';
      map.setPaintProperty(L_CIRCULO, 'circle-color', [
        'case', ['==', ['get', 'norm'], sel], TEAL, TEAL_SUAVE,
      ]);
      map.setPaintProperty(L_CIRCULO, 'circle-stroke-width', [
        'case', ['==', ['get', 'norm'], sel], 3, 1.5,
      ]);
    };

    // ⚠️ Teto de tentativas: sem ele uma falha permanente (estilo sem glyph,
    // por exemplo) viraria laço infinito de timer numa tela que fica aberta.
    let conferencias = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const agendarConferencia = () => {
      if (!vivo || conferencias >= 12) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!vivo) return;
        if (!map.getLayer(L_CALOR) || !map.getLayer(L_CIRCULO)) {
          conferencias += 1;
          diag('camadas sumiram (setStyle?) — reaplicando', { tentativa: conferencias });
          aplicar();
        }
      }, 400);
    };

    const aplicar = () => {
      if (!vivo) return;
      // ⚠️⚠️ NÃO guardar com `map.isStyleLoaded()`. Ele pode ficar `false` para
      // sempre (estilo com recurso que não resolve), e aí a camada NUNCA é
      // criada — sem erro, sem log, com o basemap desenhado por cima. Foi
      // exatamente esse silêncio que custou três tentativas em 23/08/2026.
      // A régua correta é TENTAR: se o estilo ainda não aceita, o `addSource`
      // lança, o catch registra e o próximo gatilho tenta de novo. `aplicar` é
      // idempotente, então tentar de novo é de graça.
      diag('aplicar', {
        estiloPronto: map.isStyleLoaded(),
        features: dadosRef.current.features.length,
        temSource: !!map.getSource(SRC),
        temCalor: !!map.getLayer(L_CALOR),
      });
      try {
        const src = map.getSource(SRC) as MapLibreGL.GeoJSONSource | undefined;
        if (src) src.setData(dadosRef.current as never);
        else map.addSource(SRC, { type: 'geojson', data: dadosRef.current as never });

        if (!map.getLayer(L_CALOR)) {
          map.addLayer({
            id: L_CALOR,
            type: 'heatmap',
            source: SRC,
            paint: {
              'heatmap-weight': ['get', 'peso'],
              // ⚠️⚠️ RAIO E INTENSIDADE ESCALAM COM O ZOOM, e isto é o conserto
              // do calor invisível (medido em produção, 24/08/2026): com raio
              // FIXO de 46px a mancha nascia do mesmo tamanho do chip que é
              // desenhado em cima dela, então o calor existia (as camadas
              // sobem: `camadas ok calor=true`) e ficava 100% coberto. Interpolar
              // `heatmap-radius`/`heatmap-intensity` por zoom é o uso canônico
              // do tipo `heatmap` na própria maplibre — não é a expressão
              // aninhada exótica que o comentário do círculo abaixo evita.
              // ⚠️⚠️ A CURVA É CALIBRADA PELO ZOOM INICIAL, que é ~9 (o
              // `fitBounds` do núcleo abre de Itaguaí a Maricá). Medido em
              // produção em 24/08/2026: com 48px em z9 as manchas nascem do
              // tamanho dos chips e o mapa parece vazio — bastava UM clique de
              // zoom para o calor aparecer. Quem abre a tela não dá esse
              // clique, então o raio em z9 tem de ser generoso desde o início.
              'heatmap-intensity': [
                'interpolate', ['linear'], ['zoom'],
                7, 2.2,
                11, 2.6,
                15, 3.2,
              ],
              'heatmap-radius': [
                'interpolate', ['linear'], ['zoom'],
                7, 55,
                9, 95,
                11, 130,
                13, 175,
                15, 240,
              ],
              'heatmap-opacity': 0.85,
              // ⚠️ A rampa começa a colorir em densidade BAIXA (0.06): são ~24
              // bairros espalhados pela região metropolitana, então a densidade
              // real nunca chega perto de 1 fora da Barra. Rampa que só acende
              // no fim deixaria o mapa cinza justamente onde mora quase todo
              // mundo — e o pedido era ver a concentração.
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.06, 'rgba(0,179,157,0.35)',
                0.22, 'rgba(56,189,248,0.55)',
                0.42, 'rgba(163,230,53,0.68)',
                0.62, 'rgba(250,204,21,0.80)',
                0.82, 'rgba(249,115,22,0.88)',
                1, 'rgba(220,38,38,0.92)',
              ],
            },
          });
        }

        if (!map.getLayer(L_CIRCULO)) {
          map.addLayer({
            id: L_CIRCULO,
            type: 'circle',
            source: SRC,
            paint: {
              // Área proporcional a pessoas (raio pela raiz): é assim que o olho
              // compara círculo. Raio proporcional a n faria o maior bairro
              // parecer 10x o que ele é.
              // ⚠️ Interpolação por TOTAL, sem aninhar no zoom. Expressão
              // zoom-e-propriedade é aceita na especificação, mas aninhar duas
              // interpolações é justamente o tipo de expressão que falha em
              // runtime deixando a camada criada e invisível. Área cresce com a
              // contagem sem precisar disso.
              // ⚠️ Raios ENCOLHIDOS (era 9→34) porque o chip passou a ser o
              // rótulo do número, não o protagonista: quem responde "onde se
              // concentra mais gente" agora é a mancha de calor, e chip grande
              // tapa exatamente o ponto mais quente. A área segue proporcional,
              // então a comparação entre bairros continua de pé.
              'circle-radius': [
                'interpolate', ['linear'], ['get', 'total'],
                1, 8,
                5, 12,
                20, 17,
                60, 22,
              ],
              'circle-color': TEAL_SUAVE,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
            },
          });
        }

        if (!map.getLayer(L_NUMERO)) {
          // ⚠️ Em try PRÓPRIO: se o fontstack do estilo não existir, o número
          // não aparece — e o calor e os círculos continuam de pé. Perder o
          // rótulo é aceitável; perder o mapa não.
          try {
            map.addLayer({
              id: L_NUMERO,
              type: 'symbol',
              source: SRC,
              layout: {
                'text-field': ['to-string', ['get', 'total']],
                'text-font': ['Open Sans Semibold', 'Open Sans Regular', 'Noto Sans Regular'],
                'text-size': 12,
                'text-allow-overlap': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(0,0,0,0.45)',
                'text-halo-width': 1,
              },
            });
          } catch {
            /* estilo sem glyph: segue sem o rótulo */
          }
        }

        pintarSelecao();
        // ⚠️⚠️ PEDIR O FRAME É OBRIGATÓRIO, e é a 4ª causa do mapa vazio (medida
        // em produção em 24/08/2026). `Enquadrar` dispara o `fitBounds` no
        // `isLoaded`, e as camadas nascem DEPOIS, no `styledata`/`idle` — ou
        // seja, quando elas passam a existir não há mais movimento de câmera
        // nenhum, e o maplibre não redesenha por conta própria. O sintoma é
        // cruel de diagnosticar: `camadas ok calor=true`, source com as
        // features, zero erro no console, tela vazia — e UM clique de zoom
        // mostra tudo, porque mover a câmera é o que agendava o frame.
        map.triggerRepaint();
        // ⚠️⚠️ CONFERIR DEPOIS, porque `setStyle` apaga camada de `addLayer`.
        // Medido em produção em 24/08/2026: trocar o tema com o mapa na tela
        // some com o calor e com os chips, e nada os traz de volta — o
        // `styledata` da troca chega enquanto o estilo está em transição, o
        // `addLayer` daquele instante é descartado sem lançar, e depois não vem
        // mais gatilho nenhum. Conferir o estado 400 ms depois e reaplicar é o
        // que torna isto auto-curável sem depender da ordem dos eventos do
        // maplibre — que é justamente o que enganou quatro tentativas.
        agendarConferencia();
        // ⚠️ INSTRUMENTAÇÃO opt-in (`?diagmapa=1`). Existe porque este mapa já
        // consumiu CINCO hipóteses erradas de "por que não pinta" — todas
        // plausíveis, todas indistinguíveis pelo sintoma. Sem poder inspecionar
        // a instância no navegador a investigação continua sendo chute. Só
        // atribui quando o diagnóstico está pedido, então não vaza referência
        // global em uso normal.
        if (DIAG) (window as unknown as { __mapaBairros?: unknown }).__mapaBairros = map;
        diag('estado do render', {
          zoom: map.getZoom().toFixed(2),
          centro: map.getCenter().toArray().map((n) => n.toFixed(3)).join(','),
          estiloPronto: map.isStyleLoaded(),
          calorVisivel: map.getLayoutProperty(L_CALOR, 'visibility') ?? 'default',
          raioCalor: JSON.stringify(map.getPaintProperty(L_CALOR, 'heatmap-radius')),
          featuresRenderizadas: (() => {
            try { return map.queryRenderedFeatures(undefined, { layers: [L_CIRCULO] }).length; }
            catch { return 'erro'; }
          })(),
          featuresNaSource: (() => {
            try { return map.querySourceFeatures(SRC).length; } catch { return 'erro'; }
          })(),
        });
        diag('camadas ok', { calor: !!map.getLayer(L_CALOR), circulo: !!map.getLayer(L_CIRCULO), numero: !!map.getLayer(L_NUMERO) });
      } catch (e) {
        // ⚠️ Não é erro fatal: o próximo gatilho tenta de novo. Fica em `warn`
        // para não gritar em cima de uma tentativa que a seguinte resolve.
        diag('aplicar falhou (o proximo gatilho tenta de novo)', e);
      }
    };

    aplicar();
    // ⚠️⚠️ TRÊS gatilhos, e nenhum é redundante. `aplicar()` só age com
    // `isStyleLoaded()` true; se na montagem o estilo ainda não estiver pronto
    // e o último `styledata` já tiver passado, NÃO existe nova chance — o mapa
    // desenha o basemap e fica sem camada nenhuma, em silêncio (medido em
    // produção em 23/08/2026: mapa certo, enquadramento certo, zero calor).
    // `idle` dispara toda vez que o mapa termina de acomodar e é o que fecha
    // essa janela; `load` cobre o caminho feliz.
    map.on('styledata', aplicar);
    map.on('idle', aplicar);
    map.on('load', aplicar);
    map.on('style.load', aplicar);
    // ⚠️⚠️ Erro de EXPRESSÃO de camada chega por este evento, não como exceção
    // do `addLayer`. Sem escutar, uma expressão inválida deixa a camada criada e
    // invisível, sem nada no console — que foi o estado da tela em 23/08/2026.
    const aoErrar = (e: { error?: { message?: string } }) => {
      diag('erro do mapa', { msg: e?.error?.message ?? 'sem mensagem' });
    };
    map.on('error', aoErrar);

    const popup = new MapLibreGL.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
    const aoClicar = (e: MapLibreGL.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const norm = f?.properties?.norm as string | undefined;
      if (!norm) return;
      onSelRef.current?.(selRef.current === norm ? null : norm);
    };
    const aoEntrar = (e: MapLibreGL.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      const p = f.properties as { bairro: string; total: number; pct: number };
      const pessoas = `${p.total} ${Number(p.total) === 1 ? 'pessoa' : 'pessoas'}`;
      // ⚠️ O tipo `Geometry` cobre GeometryCollection, que não tem `coordinates`.
      // A source aqui só produz Point (montarGeoJson), então o estreitamento é
      // seguro — mas checado, para um dado torto não virar popup no lugar errado.
      const geo = f.geometry as unknown as { type?: string; coordinates?: [number, number] };
      if (geo.type !== 'Point' || !geo.coordinates) return;
      const coord = geo.coordinates;
      popup
        .setLngLat(coord)
        .setHTML(
          `<div style="font:600 13px/1.3 system-ui;color:#111">${escapar(String(p.bairro))}</div>` +
            `<div style="font:400 12px/1.3 system-ui;color:#555;margin-top:2px">${pessoas} · ${p.pct}% de quem está no mapa</div>`,
        )
        .addTo(map);
    };
    const aoSair = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    map.on('click', L_CIRCULO, aoClicar);
    map.on('mouseenter', L_CIRCULO, aoEntrar);
    map.on('mouseleave', L_CIRCULO, aoSair);

    return () => {
      vivo = false;
      map.off('styledata', aplicar);
      map.off('idle', aplicar);
      map.off('load', aplicar);
      map.off('style.load', aplicar);
      map.off('error', aoErrar);
      map.off('click', L_CIRCULO, aoClicar);
      map.off('mouseenter', L_CIRCULO, aoEntrar);
      map.off('mouseleave', L_CIRCULO, aoSair);
      popup.remove();
      // ⚠️ Remoção defensiva: o mapa pode já ter sido destruído pelo pai.
      try {
        if (timer) clearTimeout(timer);
        [L_NUMERO, L_CIRCULO, L_CALOR].forEach((l) => {
          if (map.getLayer(l)) map.removeLayer(l);
        });
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* mapa ja foi embora */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);

  // Dado novo entra pela source, sem recriar camada nem listener.
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SRC) as MapLibreGL.GeoJSONSource | undefined;
    if (src) src.setData(dados as never);
  }, [dados, map, isLoaded]);

  useEffect(() => {
    if (!map || !map.getLayer(L_CIRCULO)) return;
    const sel = selecionado ?? ' ';
    map.setPaintProperty(L_CIRCULO, 'circle-color', [
      'case', ['==', ['get', 'norm'], sel], TEAL, TEAL_SUAVE,
    ]);
    map.setPaintProperty(L_CIRCULO, 'circle-stroke-width', [
      'case', ['==', ['get', 'norm'], sel], 3, 1.5,
    ]);
  }, [selecionado, map, isLoaded]);

  return null;
}

/** ⚠️⚠️ O maplibre NÃO descobre sozinho que o container mudou de tamanho: o
 *  canvas fica com a dimensão antiga e a tela cheia mostra o mapa pequeno num
 *  quadro grande. `map.resize()` é obrigatório a cada troca — e vai num
 *  `requestAnimationFrame` porque o efeito roda antes do browser aplicar o
 *  layout novo, então medir na hora leria o tamanho velho. */
function AjustarTamanho({ marca }: { marca: unknown }) {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const id = requestAnimationFrame(() => {
      map.resize();
      map.triggerRepaint();
    });
    return () => cancelAnimationFrame(id);
  }, [map, marca]);
  return null;
}

/** Tema do sistema. O `[data-theme]` só existe quando alguém escolheu — sem
 *  ele vale o escuro, que é o padrão do ERP. */
function useTemaDoSistema(): 'light' | 'dark' {
  const [tema, setTema] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'light' : 'dark');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      setTema(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

export default function MapaBairros({
  bairros,
  selecionado,
  onSelecionar,
}: {
  bairros: BairroMapa[];
  selecionado?: string | null;
  onSelecionar?: (norm: string | null) => void;
}) {
  const tema = useTemaDoSistema();
  const [verTudo, setVerTudo] = useState(false);
  const [expandido, setExpandido] = useState(false);

  // ⚠️ Esc é o gesto que a pessoa TENTA primeiro em qualquer tela cheia. Sem
  // ele o único jeito de sair é achar o botão, e em tela cheia o botão some no
  // meio do mapa.
  useEffect(() => {
    if (!expandido) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandido(false);
    };
    window.addEventListener('keydown', aoTeclar);
    // ⚠️ Trava o scroll do documento: sem isto a roda do mouse sobre a borda do
    // mapa rola a página por trás do overlay.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [expandido]);
  const totalNoMapa = useMemo(() => bairros.reduce((s, b) => s + b.total, 0), [bairros]);
  const fora = useMemo(() => nucleoDoMapa(bairros).fora, [bairros]);

  if (bairros.length === 0) {
    return (
      <div className="h-[420px] rounded-[16px] border border-border grid place-items-center text-center p-6">
        <div>
          <p className="text-sm font-medium">Nenhum bairro no mapa ainda</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            O mapa precisa de duas coisas: pessoas com bairro no cadastro e o centróide
            daquele bairro resolvido. Use “Resolver bairros” abaixo.
          </p>
        </div>
      </div>
    );
  }

  return (
    // ⚠️⚠️ A ÁRVORE É A MESMA nos dois modos — só as classes mudam. Mover o
    // `<Map>` para dentro de outro wrapper faria o React desmontar e remontar o
    // mapa a cada expansão: instância nova, estilo recarregado, camadas
    // recriadas e a câmera de volta ao enquadramento inicial. Trocar classe
    // preserva tudo.
    <div
      className={
        expandido
          ? 'fixed inset-0 z-[1100] flex flex-col gap-2 bg-background p-4'
          : 'space-y-2'
      }
    >
      <div
        className={
          expandido
            ? 'relative flex-1 min-h-0 rounded-[16px] overflow-hidden border border-border'
            : 'relative h-[420px] rounded-[16px] overflow-hidden border border-border'
        }
      >
        <Map theme={tema} center={[-43.35, -22.93]} zoom={10}>
          <Enquadrar bairros={bairros} tudo={verTudo} />
          <MapControls position="top-right" />
          <AjustarTamanho marca={expandido} />
          <Camadas
            bairros={bairros}
            totalNoMapa={totalNoMapa}
            selecionado={selecionado}
            onSelecionar={onSelecionar}
          />
        </Map>

        {/* ⚠️ Canto superior ESQUERDO: o direito é dos controles de zoom do
            maplibre (`MapControls position="top-right"`). */}
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-label={expandido ? 'Sair da tela cheia' : 'Ver o mapa em tela cheia'}
          title={expandido ? 'Sair da tela cheia (Esc)' : 'Ver em tela cheia'}
          className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-card"
        >
          {expandido ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {expandido ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span>menos gente</span>
          <span
            className="h-2.5 w-28 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,179,157,0.45), rgba(56,189,248,0.7), rgba(163,230,53,0.8), rgba(250,204,21,0.9), rgba(249,115,22,0.95), rgba(220,38,38,1))',
            }}
          />
          <span>mais gente</span>
        </span>
        <span>O número dentro do círculo é quantas pessoas moram naquele bairro.</span>
        {fora.length > 0 && (
          <button
            type="button"
            onClick={() => setVerTudo((v) => !v)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {verTudo
              ? 'Voltar ao enquadramento principal'
              : `${fora.length} bairro(s) fora do quadro inicial — enquadrar tudo`}
          </button>
        )}
      </div>
    </div>
  );
}
