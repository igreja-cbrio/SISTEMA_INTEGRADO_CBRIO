import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw, CalendarOff, Check, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useMyServices, useToggleServiceUnavailability } from './hooks';

const TYPE_COLORS: Record<string, string> = {
  'Quarta com Deus': '#6366f1',
  'AMI': '#f59e0b',
  'Bridge': '#ec4899',
  'Domingo 08:30': '#00B39D',
  'Domingo 10:00': '#10b981',
  'Domingo 11:30': '#3b82f6',
  'Domingo 19:00': '#8b5cf6',
};
function typeColor(name: string) { return TYPE_COLORS[name] ?? '#00B39D'; }

// Extrai apenas a parte da data (sem timezone) para evitar desvio de UTC
function dateOnly(scheduledAt: string) { return parseISO(scheduledAt.slice(0, 10)); }
function timeOnly(scheduledAt: string) { return scheduledAt.slice(11, 16); }

type Service = {
  id: string; name: string; service_type_name: string;
  service_type_id: string | null; scheduled_at: string;
  is_unavailable: boolean; availability_id: string | null;
};

function ServiceChip({ service, onToggle, disabled }: {
  service: Service; onToggle: (s: Service) => void; disabled: boolean;
}) {
  const d = dateOnly(service.scheduled_at);
  const t = timeOnly(service.scheduled_at);
  const color = typeColor(service.service_type_name || service.name);
  const unavailable = service.is_unavailable;

  return (
    <button
      onClick={() => onToggle(service)}
      disabled={disabled}
      title={unavailable ? 'Toque para marcar como disponivel' : 'Toque para marcar ausencia'}
      className={`flex flex-col items-center w-[58px] py-2 rounded-xl border text-xs font-medium transition-all shrink-0
        ${unavailable
          ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-700 dark:text-red-300'
          : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
        }`}
    >
      <span className="text-[10px] opacity-60 capitalize">{format(d, 'EEE', { locale: ptBR })}</span>
      <span className="text-base font-bold leading-tight">{format(d, 'dd')}</span>
      <span className="text-[10px] opacity-60 capitalize">{format(d, 'MMM', { locale: ptBR })}</span>
      <span className="text-[9px] opacity-50 mt-0.5">{t}</span>
      {unavailable
        ? <span className="text-[8px] text-red-400 font-bold mt-0.5">ausente</span>
        : <Check className="h-2.5 w-2.5 mt-0.5" style={{ color }} />
      }
    </button>
  );
}

export default function VolMinhaDisponibilidade() {
  const [year, setYear] = useState(2026);
  const [searchDate, setSearchDate] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: services = [], isLoading, refetch } = useMyServices(year);

  const toggleCollapse = (typeName: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(typeName) ? next.delete(typeName) : next.add(typeName);
      return next;
    });
  const toggle = useToggleServiceUnavailability();

  const handleToggle = (service: Service) => {
    toggle.mutate(
      { serviceId: service.id, isUnavailable: service.is_unavailable, availabilityId: service.availability_id },
      {
        onSuccess: () => toast.success(service.is_unavailable ? 'Disponibilidade restaurada' : 'Ausencia registrada'),
        onError: (err: any) => toast.error(err.message || 'Erro ao atualizar'),
      }
    );
  };

  // Busca por data: compara apenas yyyy-MM-dd, sem timezone
  const searchResults = useMemo(() => {
    if (!searchDate) return null;
    return services.filter(s => s.scheduled_at.slice(0, 10) === searchDate);
  }, [services, searchDate]);

  // Agrupa por tipo de culto, ordenado pela data do primeiro culto de cada tipo
  const byType = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of services) {
      const key = s.service_type_name || s.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a[0].scheduled_at.localeCompare(b[0].scheduled_at));
  }, [services]);

  const unavailableCount = services.filter(s => s.is_unavailable).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Minha Disponibilidade</h1>
          <p className="text-sm text-muted-foreground">
            Toque nos cultos que voce <strong>nao pode comparecer</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => refetch()}
            className="h-9 w-9 rounded-md border border-input bg-background flex items-center justify-center text-muted-foreground hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Busca por data */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="date"
          value={searchDate}
          onChange={e => setSearchDate(e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchDate && (
          <button
            onClick={() => setSearchDate('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <CalendarOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-muted-foreground">Nenhum culto cadastrado para {year}</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Peca para o lider gerar os cultos em "Tipos de Culto"
          </p>
        </div>
      ) : searchDate ? (
        // Resultado da busca por data
        !searchResults || searchResults.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <CalendarOff className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum culto em {format(parseISO(searchDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {searchResults.length} culto(s) em {format(parseISO(searchDate), "dd 'de' MMMM", { locale: ptBR })}
            </p>
            <div className="flex flex-wrap gap-2">
              {searchResults.map(s => (
                <ServiceChip key={s.id} service={s} onToggle={handleToggle} disabled={toggle.isPending} />
              ))}
            </div>
          </div>
        )
      ) : (
        // Lista agrupada por tipo de culto
        <div className="space-y-6">
          {/* Resumo */}
          <div className="flex gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#00B39D]" />
              <span className="text-muted-foreground">{services.length - unavailableCount} disponivel(is)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className={unavailableCount > 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                {unavailableCount} ausencia(s)
              </span>
            </div>
          </div>

          {byType.map(([typeName, typeServices]) => {
            const color = typeColor(typeName);
            const unavailInType = typeServices.filter(s => s.is_unavailable).length;
            const isCollapsed = collapsed.has(typeName);
            return (
              <div key={typeName}>
                <button
                  onClick={() => toggleCollapse(typeName)}
                  className="w-full flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity text-left"
                >
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <h2 className="text-sm font-semibold text-foreground">{typeName}</h2>
                  <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{typeServices.length}x</span>
                    {unavailInType > 0 && (
                      <span className="text-red-500 font-medium">{unavailInType} ausente(s)</span>
                    )}
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />
                    }
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="flex flex-wrap gap-2">
                    {typeServices.map(s => (
                      <ServiceChip key={s.id} service={s} onToggle={handleToggle} disabled={toggle.isPending} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
