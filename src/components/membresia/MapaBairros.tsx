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
    if (!isLoaded || !map) return;
    let vivo = true;

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

    const aplicar = () => {
      // ⚠️ `styledata` dispara antes de o estilo estar pronto para receber
      // camada; sem esta guarda o addSource lança e o mapa fica vazio.
      if (!vivo || !map.isStyleLoaded()) return;
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
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 1.6],
              // Raio em PIXEL: é o que faz a mancha continuar legível quando o
              // enquadramento afasta por causa de um bairro distante.
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 26, 11, 44, 14, 70],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 14, 0.55],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.15, 'rgba(0,179,157,0.40)',
                0.35, 'rgba(56,189,248,0.60)',
                0.55, 'rgba(163,230,53,0.70)',
                0.75, 'rgba(250,204,21,0.82)',
                0.9, 'rgba(249,115,22,0.88)',
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
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                8, ['+', 4, ['*', 2.2, ['sqrt', ['get', 'total']]]],
                12, ['+', 6, ['*', 3.4, ['sqrt', ['get', 'total']]]],
                15, ['+', 8, ['*', 4.6, ['sqrt', ['get', 'total']]]],
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
                'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13],
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
      } catch (e) {
        console.warn('[mapa-bairros] nao consegui montar as camadas', e);
      }
    };

    aplicar();
    map.on('styledata', aplicar);

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
      map.off('click', L_CIRCULO, aoClicar);
      map.off('mouseenter', L_CIRCULO, aoEntrar);
      map.off('mouseleave', L_CIRCULO, aoSair);
      popup.remove();
      // ⚠️ Remoção defensiva: o mapa pode já ter sido destruído pelo pai.
      try {
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
    if (!isLoaded || !map) return;
    const src = map.getSource(SRC) as MapLibreGL.GeoJSONSource | undefined;
    if (src) src.setData(dados as never);
  }, [dados, map, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !map || !map.getLayer(L_CIRCULO)) return;
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
    <div className="space-y-2">
      <div className="h-[420px] rounded-[16px] overflow-hidden border border-border">
        <Map theme={tema} center={[-43.35, -22.93]} zoom={10}>
          <Enquadrar bairros={bairros} tudo={verTudo} />
          <MapControls position="top-right" />
          <Camadas
            bairros={bairros}
            totalNoMapa={totalNoMapa}
            selecionado={selecionado}
            onSelecionar={onSelecionar}
          />
        </Map>
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
