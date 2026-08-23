// Onde a membresia mora · um círculo por BAIRRO, tamanho pelo nº de pessoas.
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
// ⚠️ Bairro sem centróide NÃO some em silêncio: quem chama recebe
// `pessoas_fora_do_mapa` e mostra ao lado. Mapa que esconde o próprio buraco é
// pior que mapa vazio — quem olha conclui que a igreja inteira mora ali.
import { useEffect, useMemo, useState } from 'react';
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls, useMap } from '@/components/ui/map';

export type BairroMapa = {
  bairro: string;
  norm: string;
  total: number;
  lat: number;
  lng: number;
};

/** Enquadra o mapa em TUDO que está desenhado, e refaz quando o filtro muda.
 *  Sem isto, filtrar por um bairro deixaria a câmera no Rio inteiro. */
function Enquadrar({ bairros }: { bairros: BairroMapa[] }) {
  const { map, isLoaded } = useMap();
  // A chave só muda quando o CONJUNTO de pontos muda — sem ela, cada render
  // do pai reenquadraria o mapa e a pessoa não conseguiria dar zoom.
  const chave = bairros.map((b) => b.norm).sort().join('|');
  useEffect(() => {
    if (!isLoaded || !map || bairros.length === 0) return;
    if (bairros.length === 1) {
      map.flyTo({ center: [bairros[0].lng, bairros[0].lat], zoom: 13, duration: 600 });
      return;
    }
    const lats = bairros.map((b) => b.lat);
    const lngs = bairros.map((b) => b.lng);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 64, duration: 600, maxZoom: 14 },
    );
    // `chave` é a dependência real; `bairros` muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, isLoaded, map]);
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
  const maior = useMemo(() => Math.max(1, ...bairros.map((b) => b.total)), [bairros]);
  const totalNoMapa = useMemo(() => bairros.reduce((s, b) => s + b.total, 0), [bairros]);

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
    <div className="h-[420px] rounded-[16px] overflow-hidden border border-border">
      <Map theme={tema} center={[-43.35, -22.93]} zoom={10}>
        <Enquadrar bairros={bairros} />
        <MapControls position="top-right" />
        {bairros.map((b) => {
          // Área ∝ pessoas (raio ∝ √n): é assim que o olho compara círculo.
          // Raio ∝ n faria o maior bairro parecer 10× o que ele é.
          const escala = Math.sqrt(b.total / maior);
          const lado = Math.round(20 + escala * 44);
          const ativo = selecionado === b.norm;
          return (
            <MapMarker
              key={b.norm}
              longitude={b.lng}
              latitude={b.lat}
              onClick={() => onSelecionar?.(ativo ? null : b.norm)}
            >
              <MarkerContent>
                <div
                  className="rounded-full grid place-items-center font-semibold tabular-nums transition-transform"
                  style={{
                    width: lado,
                    height: lado,
                    background: ativo ? 'rgba(0,179,157,0.92)' : 'rgba(0,179,157,0.55)',
                    border: `2px solid ${ativo ? '#fff' : 'rgba(255,255,255,0.75)'}`,
                    color: '#fff',
                    fontSize: lado >= 40 ? 13 : 11,
                    transform: ativo ? 'scale(1.08)' : undefined,
                  }}
                >
                  {b.total}
                </div>
              </MarkerContent>
              <MarkerPopup>
                <p className="text-sm font-semibold">{b.bairro}</p>
                <p className="text-xs text-muted-foreground">
                  {b.total} {b.total === 1 ? 'pessoa' : 'pessoas'}
                  {totalNoMapa > 0 && ` · ${Math.round((b.total / totalNoMapa) * 100)}% de quem está no mapa`}
                </p>
              </MarkerPopup>
            </MapMarker>
          );
        })}
      </Map>
    </div>
  );
}
