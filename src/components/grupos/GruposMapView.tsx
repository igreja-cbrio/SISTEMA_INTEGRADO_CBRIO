"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Sun,
  Moon,
  MapPin,
  Clock,
  Navigation as NavIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls, useMap } from "@/components/ui/map";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DIAS_MAP: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export interface MapGroup {
  id: string;
  nome: string;
  categoria?: string | null;
  lat?: number | null;
  lng?: number | null;
  local?: string | null;
  dia_semana?: number | null;
  horario?: string | null;
  lider?: { nome?: string } | null;
  lider_nome?: string | null;
  dist?: number | null;
}

interface Coords {
  lat: number;
  lng: number;
}

interface GruposMapViewProps {
  grupos: MapGroup[];
  memberCoords?: Coords | null;
  variant?: "admin" | "kiosk";
  defaultTheme?: "light" | "dark";
  onGroupSelect?: (g: MapGroup) => void;
  onGroupSelectLabel?: string;
  className?: string;
}

function fmtDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// Inner component that has access to the map context for fly-to behavior
function FlyToTarget({ target }: { target: MapGroup | null }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!isLoaded || !map || !target?.lat || !target?.lng) return;
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: 15,
      duration: 800,
      essential: true,
    });
  }, [target, isLoaded, map]);
  return null;
}


const PIN_COLOR = "#00B39D";
const PIN_MEMBER_COLOR = "#3B82F6";

function GroupPin({ active = false, color = PIN_COLOR }: { active?: boolean; color?: string }) {
  return (
    <div className="relative flex flex-col items-center" style={{ transform: active ? "scale(1.15)" : undefined }}>
      <svg width="32" height="40" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.3 21.7 0 14 0z"
          fill={color}
          stroke="#fff"
          strokeWidth={2}
        />
        <circle cx={14} cy={14} r={6} fill="#fff" />
      </svg>
      {active && (
        <span
          className="absolute -bottom-1 h-2 w-2 rounded-full animate-ping"
          style={{ backgroundColor: color, opacity: 0.6 }}
        />
      )}
    </div>
  );
}

function MemberPin() {
  return (
    <div style={{ position: "relative", width: 28, height: 28 }}>
      <style>{`
        @keyframes cbrio-member-pulse {
          0%   { transform: translate(-50%,-50%) scale(1); opacity: 0.6; }
          100% { transform: translate(-50%,-50%) scale(3.8); opacity: 0; }
        }
        .cbrio-member-ring {
          position: absolute; top: 50%; left: 50%;
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(59,130,246,0.4);
          animation: cbrio-member-pulse 1.8s ease-out infinite;
        }
        .cbrio-member-ring-2 {
          position: absolute; top: 50%; left: 50%;
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(59,130,246,0.3);
          animation: cbrio-member-pulse 1.8s ease-out infinite;
          animation-delay: 0.6s;
        }
        .cbrio-member-dot {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%);
          width: 18px; height: 18px; border-radius: 50%;
          background: #3B82F6;
          border: 2.5px solid white;
          box-shadow: 0 0 8px rgba(59,130,246,0.8);
        }
      `}</style>
      <div className="cbrio-member-ring" />
      <div className="cbrio-member-ring-2" />
      <div className="cbrio-member-dot" />
    </div>
  );
}

export function GruposMapView({
  grupos,
  memberCoords,
  variant = "admin",
  defaultTheme = "dark",
  onGroupSelect,
  onGroupSelectLabel = "Quero participar",
  className,
}: GruposMapViewProps) {
  const [theme, setTheme] = useState<"light" | "dark">(defaultTheme);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const flyTargetRef = useRef<MapGroup | null>(null);
  const [flyTarget, setFlyTarget] = useState<MapGroup | null>(null);

  const isKiosk = variant === "kiosk";

  // Lock body scroll for kiosk fullscreen feel? not needed; container is full.

  const categories = useMemo(
    () => Array.from(new Set(grupos.map((g) => g.categoria).filter(Boolean))) as string[],
    [grupos]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return grupos.filter((g) => {
      if (filterCat && g.categoria !== filterCat) return false;
      if (s) {
        const hay = `${g.nome ?? ""} ${g.lider?.nome ?? g.lider_nome ?? ""} ${g.local ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [grupos, search, filterCat]);

  const withCoords = filtered.filter((g) => g.lat != null && g.lng != null);

  // Initial center: member coords > first group with coords > Rio default
  const initialCenter: [number, number] = memberCoords
    ? [memberCoords.lng, memberCoords.lat]
    : withCoords[0]?.lat && withCoords[0]?.lng
    ? [withCoords[0].lng!, withCoords[0].lat!]
    : [-43.1729, -22.9068];

  const handleSelectFromList = (g: MapGroup) => {
    if (g.lat == null || g.lng == null) return;
    setActiveId(g.id);
    flyTargetRef.current = g;
    setFlyTarget({ ...g });
  };

  const themeBg = theme === "dark" ? "bg-gray-950 text-white" : "bg-white text-gray-900";
  const sidebarBg = theme === "dark" ? "bg-gray-900/95 border-white/10 text-white" : "bg-white/95 border-gray-200 text-gray-900";
  const itemBg = theme === "dark" ? "bg-white/5 hover:bg-white/10 border-white/10" : "bg-gray-50 hover:bg-gray-100 border-gray-200";
  const itemActive = "border-[#00B39D] bg-[#00B39D]/10";
  const mutedText = theme === "dark" ? "text-white/60" : "text-gray-600";
  const subtleText = theme === "dark" ? "text-white/40" : "text-gray-500";

  const totalSemCoord = filtered.length - withCoords.length;

  return (
    <div className={cn("relative flex h-full w-full overflow-hidden", themeBg, className)}>
      {/* Sidebar */}
      <aside
        className={cn(
          "relative z-30 flex flex-col border-r transition-all duration-300 ease-out",
          sidebarBg,
          sidebarOpen ? "w-[320px]" : "w-0",
        )}
        style={{ minWidth: sidebarOpen ? 320 : 0 }}
      >
        {sidebarOpen && (
          <>
            <div className="p-4 border-b border-inherit space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
                  Grupos no mapa
                </h3>
                <span className={cn("text-xs", subtleText)}>
                  {withCoords.length}/{filtered.length}
                </span>
              </div>

              <div className="relative">
                <Search className={cn("absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5", subtleText)} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar grupo, líder, local..."
                  className={cn(
                    "w-full pl-8 pr-3 py-2 rounded-md text-sm outline-none border",
                    theme === "dark"
                      ? "bg-white/5 border-white/10 placeholder:text-white/30"
                      : "bg-white border-gray-200 placeholder:text-gray-400 focus:border-[#00B39D]"
                  )}
                />
              </div>

              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterCat("")}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs transition-colors",
                      !filterCat
                        ? "bg-[#00B39D] text-white"
                        : theme === "dark"
                        ? "bg-white/10 text-white/60 hover:bg-white/15"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    Todos
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(cat === filterCat ? "" : cat)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs transition-colors",
                        filterCat === cat
                          ? "bg-[#00B39D] text-white"
                          : theme === "dark"
                          ? "bg-white/10 text-white/60 hover:bg-white/15"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filtered.length === 0 && (
                <div className={cn("text-center text-sm py-12", mutedText)}>
                  Nenhum grupo encontrado.
                </div>
              )}
              {filtered.map((g) => {
                const hasCoord = g.lat != null && g.lng != null;
                const isActive = activeId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => hasCoord && handleSelectFromList(g)}
                    disabled={!hasCoord}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-all",
                      hasCoord ? "cursor-pointer hover:scale-[1.01]" : "opacity-50 cursor-not-allowed",
                      isActive ? itemActive : itemBg,
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="h-8 w-8 rounded-lg bg-[#00B39D]/20 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-[#00B39D]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{g.nome}</p>
                        {(g.lider?.nome || g.lider_nome) && (
                          <p className={cn("text-xs truncate", mutedText)}>
                            Líder: {g.lider?.nome || g.lider_nome}
                          </p>
                        )}
                        <div className={cn("flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px]", subtleText)}>
                          {g.dia_semana != null && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {DIAS_MAP[g.dia_semana]}
                              {g.horario ? ` • ${String(g.horario).slice(0, 5)}` : ""}
                            </span>
                          )}
                          {g.local && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{g.local}</span>
                            </span>
                          )}
                          {g.dist != null && (
                            <span className="flex items-center gap-1 text-[#00B39D]">
                              <NavIcon className="h-3 w-3" />
                              {fmtDist(g.dist)}
                            </span>
                          )}
                        </div>
                        {!hasCoord && (
                          <p className="text-[10px] text-amber-500 mt-1">Sem coordenadas</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {totalSemCoord > 0 && (
                <p className={cn("text-[11px] text-center pt-2", subtleText)}>
                  {totalSemCoord} grupo(s) sem coordenadas
                </p>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Toggle sidebar button */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className={cn(
          "absolute z-40 top-1/2 -translate-y-1/2 h-12 w-6 rounded-r-md flex items-center justify-center shadow-md transition-all",
          theme === "dark" ? "bg-gray-900/95 text-white border border-l-0 border-white/10" : "bg-white text-gray-900 border border-l-0 border-gray-200",
        )}
        style={{ left: sidebarOpen ? 320 : 0 }}
        aria-label={sidebarOpen ? "Fechar lista" : "Abrir lista"}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          theme={theme}
          center={initialCenter}
          zoom={memberCoords ? 13 : 12}
        >
          <FlyToTarget target={flyTarget} />

          {memberCoords && (
            <MapMarker longitude={memberCoords.lng} latitude={memberCoords.lat}>
              <MarkerContent>
                <MemberPin />
              </MarkerContent>
              <MarkerPopup>
                <p className="text-sm font-semibold">Você está aqui</p>
              </MarkerPopup>
            </MapMarker>
          )}

          {withCoords.map((g) => (
            <MapMarker
              key={g.id}
              longitude={g.lng!}
              latitude={g.lat!}
              onClick={() => setActiveId(g.id)}
            >
              <MarkerContent>
                <GroupPin active={activeId === g.id} />
              </MarkerContent>
              <MarkerPopup>
                <div className="min-w-[200px] space-y-1.5">
                  <p className="text-sm font-bold">{g.nome}</p>
                  {(g.lider?.nome || g.lider_nome) && (
                    <p className="text-xs text-muted-foreground">
                      Líder: {g.lider?.nome || g.lider_nome}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {g.dia_semana != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {DIAS_MAP[g.dia_semana]}
                        {g.horario ? ` • ${String(g.horario).slice(0, 5)}` : ""}
                      </span>
                    )}
                    {g.local && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {g.local}
                      </span>
                    )}
                  </div>
                  {g.dist != null && (
                    <p className="text-xs text-[#00B39D] font-medium">
                      {fmtDist(g.dist)} de você
                    </p>
                  )}
                  {onGroupSelect && (
                    <Button
                      onClick={() => onGroupSelect(g)}
                      size="sm"
                      className="w-full mt-1 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white"
                    >
                      {onGroupSelectLabel}
                    </Button>
                  )}
                </div>
              </MarkerPopup>
            </MapMarker>
          ))}

          <MapControls
            position="bottom-right"
            showZoom
            showLocate={isKiosk || !!memberCoords}
            showFullscreen={isKiosk}
          />

          {/* Theme toggle */}
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className={cn(
              "absolute top-3 right-3 z-20 h-9 w-9 rounded-lg shadow-lg border flex items-center justify-center transition-colors",
              theme === "dark"
                ? "bg-gray-900/95 border-white/10 text-white hover:bg-[#00B39D]/15 hover:text-[#00B39D]"
                : "bg-white/95 border-gray-200 text-gray-900 hover:bg-[#00B39D]/15 hover:text-[#00B39D]"
            )}
            aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Counter badge */}
          <div
            className={cn(
              "absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg border",
              theme === "dark"
                ? "bg-gray-900/95 border-white/10 text-white"
                : "bg-white/95 border-gray-200 text-gray-900"
            )}
          >
            <span className="text-[#00B39D] font-bold">{withCoords.length}</span>
            <span className="opacity-60"> grupo(s) no mapa</span>
          </div>
        </Map>
      </div>
    </div>
  );
}

export default GruposMapView;
