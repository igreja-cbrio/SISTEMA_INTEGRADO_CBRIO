"use client";

import MapLibreGL, { type PopupOptions, type MarkerOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus, Locate, Maximize, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type MapContextValue = {
  map: MapLibreGL.Map | null;
  isLoaded: boolean;
};

const MapContext = createContext<MapContextValue | null>(null);

export function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMap must be used within a Map component");
  }
  return context;
}

const defaultStyles = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

type MapStyleOption = string | MapLibreGL.StyleSpecification;

type MapProps = {
  children?: ReactNode;
  className?: string;
  styles?: {
    light?: MapStyleOption;
    dark?: MapStyleOption;
  };
  /** Tema controlado externamente. 'dark' ou 'light' */
  theme?: "light" | "dark";
} & Omit<MapLibreGL.MapOptions, "container" | "style">;

const DefaultLoader = () => (
  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
    <Loader2 className="h-6 w-6 animate-spin text-[#00B39D]" />
  </div>
);

export function Map({ children, className, styles, theme = "dark", ...props }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isStyleLoaded, setIsStyleLoaded] = useState(false);

  const mapStyles = useMemo(
    () => ({
      dark: styles?.dark ?? defaultStyles.dark,
      light: styles?.light ?? defaultStyles.light,
    }),
    [styles]
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    const mapStyle = theme === "dark" ? mapStyles.dark : mapStyles.light;

    const mapInstance = new MapLibreGL.Map({
      container: containerRef.current,
      style: mapStyle as any,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      ...props,
    });

    const styleDataHandler = () => setIsStyleLoaded(true);
    const loadHandler = () => setIsLoaded(true);

    mapInstance.on("load", loadHandler);
    mapInstance.on("styledata", styleDataHandler);
    // ⚠️⚠️ `load` NÃO é garantia. Ele exige o primeiro quadro completo, e um
    // container que nasce com altura 0 (mapa dentro de aba/toggle, que é o caso
    // do mapa de grupos e do da membresia) pode nunca chegar lá — o mapa
    // desenha, o estilo carrega, e `load` simplesmente não vem. Sem esta rede,
    // todo consumidor que espera `isLoaded` fica parado para sempre: foi assim
    // que as duas telas ficaram com ZERO marcadores (medido em 23/08/2026).
    // `idle` dispara sempre que o mapa termina de acomodar, então serve de
    // fallback; e se o mapa JÁ estiver carregado quando chegamos aqui, marcamos
    // na hora.
    const idleHandler = () => setIsLoaded(true);
    mapInstance.on("idle", idleHandler);
    if (mapInstance.loaded()) setIsLoaded(true);
    mapRef.current = mapInstance;

    return () => {
      mapInstance.off("load", loadHandler);
      mapInstance.off("idle", idleHandler);
      mapInstance.off("styledata", styleDataHandler);
      mapInstance.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  useEffect(() => {
    if (mapRef.current) {
      setIsStyleLoaded(false);
      mapRef.current.setStyle(
        (theme === "dark" ? mapStyles.dark : mapStyles.light) as any,
        { diff: true }
      );
    }
  }, [theme, mapStyles]);

  const isLoading = !isMounted || !isLoaded || !isStyleLoaded;

  return (
    <MapContext.Provider value={{ map: mapRef.current, isLoaded }}>
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        <div ref={containerRef} className="h-full w-full" />
        {isLoading && <DefaultLoader />}
        {isMounted && children}
      </div>
    </MapContext.Provider>
  );
}

type MarkerContextValue = {
  markerRef: React.MutableRefObject<MapLibreGL.Marker | null>;
  markerElementRef: React.MutableRefObject<HTMLDivElement | null>;
  map: MapLibreGL.Map | null;
  isReady: boolean;
};

const MarkerContext = createContext<MarkerContextValue | null>(null);

function useMarkerContext() {
  const context = useContext(MarkerContext);
  if (!context) {
    throw new Error("Marker components must be used within MapMarker");
  }
  return context;
}

type MapMarkerProps = {
  longitude: number;
  latitude: number;
  children?: ReactNode;
  onClick?: (e: MouseEvent) => void;
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
} & Omit<MarkerOptions, "element">;

export function MapMarker({
  longitude,
  latitude,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...markerOptions
}: MapMarkerProps) {
  const { map, isLoaded } = useMap();
  const markerRef = useRef<MapLibreGL.Marker | null>(null);
  const markerElementRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // ⚠️ Depende só do MAPA, nunca de `isLoaded`: marcador é nó DOM ancorado
    // por coordenada, não precisa do estilo pronto — e amarrá-lo ao `load` foi
    // o que sumiu com os pinos das duas telas.
    if (!map) return;

    // ⚠⚠ DOIS nós DE PROPÓSITO. `container` é do MAPLIBRE (ele insere e
    // REMOVE do documento em `marker.remove()`); `interno` é do REACT — o portal
    // do `MarkerContent` monta dentro dele. Com um nó só, o maplibre arranca do
    // DOM justamente o pai que o React ainda vai desmontar, e aí o desmonte
    // estoura `NotFoundError: removeChild` e derruba TODOS os marcadores da
    // tela — não só o que saiu. Medido em produção (23/08/2026): o mapa da
    // Membresia E o mapa público de Grupos ficaram com ZERO pinos por isto.
    // Mesma lição do arrasto do Kanban (14/08): nó renderizado pelo React nunca
    // pode ser removido por terceiro. Com o nó interno, o vínculo
    // `interno.parentNode === container` sobrevive à saída do documento e o
    // React desmonta em paz.
    const container = document.createElement("div");
    const interno = document.createElement("div");
    container.appendChild(interno);
    markerElementRef.current = interno;

    const marker = new MapLibreGL.Marker({
      ...markerOptions,
      element: container,
    })
      .setLngLat([longitude, latitude])
      .addTo(map);

    markerRef.current = marker;

    const handleClick = (e: MouseEvent) => onClick?.(e);
    const handleMouseEnter = (e: MouseEvent) => onMouseEnter?.(e);
    const handleMouseLeave = (e: MouseEvent) => onMouseLeave?.(e);

    container.addEventListener("click", handleClick);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    setIsReady(true);

    return () => {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      marker.remove();
      markerRef.current = null;
      markerElementRef.current = null;
      setIsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [longitude, latitude]);

  return (
    <MarkerContext.Provider value={{ markerRef, markerElementRef, map, isReady }}>
      {children}
    </MarkerContext.Provider>
  );
}

type MarkerContentProps = {
  children?: ReactNode;
  className?: string;
};

export function MarkerContent({ children, className }: MarkerContentProps) {
  const { markerElementRef, isReady } = useMarkerContext();
  if (!isReady || !markerElementRef.current) return null;
  return createPortal(
    <div className={cn("cursor-pointer", className)}>{children}</div>,
    markerElementRef.current
  );
}

type MarkerPopupProps = {
  children: ReactNode;
  className?: string;
  closeButton?: boolean;
} & Omit<PopupOptions, "element">;

export function MarkerPopup({
  children,
  className,
  closeButton = true,
  ...popupOptions
}: MarkerPopupProps) {
  const { markerRef, isReady } = useMarkerContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<MapLibreGL.Popup | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isReady || !markerRef.current) return;

    // Mesma razão do MapMarker acima: o pop-up também é desmontado pelo
    // maplibre, então o React precisa de um nó próprio lá dentro.
    const container = document.createElement("div");
    const interno = document.createElement("div");
    container.appendChild(interno);
    containerRef.current = interno;

    const popup = new MapLibreGL.Popup({
      offset: 24,
      ...popupOptions,
      closeButton: false,
    })
      .setMaxWidth("none")
      .setDOMContent(container);

    popupRef.current = popup;
    markerRef.current.setPopup(popup);
    setMounted(true);

    return () => {
      popup.remove();
      popupRef.current = null;
      containerRef.current = null;
      setMounted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const handleClose = () => popupRef.current?.remove();

  if (!mounted || !containerRef.current) return null;

  return createPortal(
    <div className={cn("relative rounded-lg bg-background text-foreground shadow-lg p-3", className)}>
      {closeButton && (
        <button
          onClick={handleClose}
          className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>,
    containerRef.current
  );
}

type MapControlsProps = {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  showZoom?: boolean;
  showLocate?: boolean;
  showFullscreen?: boolean;
  className?: string;
  onLocate?: (coords: { longitude: number; latitude: number }) => void;
};

const positionClasses = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-10 right-3",
};

function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg overflow-hidden shadow-lg border border-border bg-background/95 backdrop-blur">
      {children}
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-9 w-9 flex items-center justify-center text-foreground hover:bg-[#00B39D]/15 hover:text-[#00B39D] disabled:opacity-50 transition-colors"
    >
      {children}
    </button>
  );
}

export function MapControls({
  position = "bottom-right",
  showZoom = true,
  showLocate = false,
  showFullscreen = false,
  className,
  onLocate,
}: MapControlsProps) {
  const { map, isLoaded } = useMap();
  const [waitingForLocation, setWaitingForLocation] = useState(false);

  const handleZoomIn = useCallback(() => {
    map?.zoomTo(map.getZoom() + 1, { duration: 300 });
  }, [map]);

  const handleZoomOut = useCallback(() => {
    map?.zoomTo(map.getZoom() - 1, { duration: 300 });
  }, [map]);

  const handleLocate = useCallback(() => {
    setWaitingForLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            longitude: pos.coords.longitude,
            latitude: pos.coords.latitude,
          };
          map?.flyTo({
            center: [coords.longitude, coords.latitude],
            zoom: 14,
            duration: 1500,
          });
          onLocate?.(coords);
          setWaitingForLocation(false);
        },
        () => setWaitingForLocation(false)
      );
    }
  }, [map, onLocate]);

  const handleFullscreen = useCallback(() => {
    const container = map?.getContainer();
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, [map]);

  if (!isLoaded) return null;

  return (
    <div className={cn("absolute z-20 flex flex-col gap-2", positionClasses[position], className)}>
      {showZoom && (
        <ControlGroup>
          <ControlButton onClick={handleZoomIn} label="Aumentar zoom">
            <Plus className="h-4 w-4" />
          </ControlButton>
          <div className="h-px bg-border" />
          <ControlButton onClick={handleZoomOut} label="Diminuir zoom">
            <Minus className="h-4 w-4" />
          </ControlButton>
        </ControlGroup>
      )}
      {showLocate && (
        <ControlGroup>
          <ControlButton onClick={handleLocate} label="Minha localização">
            {waitingForLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
          </ControlButton>
        </ControlGroup>
      )}
      {showFullscreen && (
        <ControlGroup>
          <ControlButton onClick={handleFullscreen} label="Tela cheia">
            <Maximize className="h-4 w-4" />
          </ControlButton>
        </ControlGroup>
      )}
    </div>
  );
}
