import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw, CalendarOff, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useMyServices, useToggleServiceUnavailability } from './hooks';

const TYPE_COLORS: Record<string, string> = {};

function serviceColor(typeName: string) {
  if (!TYPE_COLORS[typeName]) {
    const palette = ['#00B39D', '#6366f1', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#ef4444'];
    TYPE_COLORS[typeName] = palette[Object.keys(TYPE_COLORS).length % palette.length];
  }
  return TYPE_COLORS[typeName];
}

export default function VolMinhaDisponibilidade() {
  const [year, setYear] = useState(2026);
  const { data: services = [], isLoading, refetch } = useMyServices(year);
  const toggle = useToggleServiceUnavailability();

  // Agrupa os cultos por mes (chave: 'yyyy-MM')
  const byMonth = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const s of services) {
      const key = s.scheduled_at.slice(0, 7); // 'yyyy-MM'
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [services]);

  const handleToggle = (service: typeof services[0]) => {
    toggle.mutate(
      { serviceId: service.id, isUnavailable: service.is_unavailable, availabilityId: service.availability_id },
      {
        onSuccess: () => {
          if (service.is_unavailable) {
            toast.success('Disponibilidade restaurada');
          } else {
            toast.error('Ausencia registrada');
          }
        },
        onError: (err: any) => toast.error(err.message || 'Erro ao atualizar'),
      }
    );
  };

  const unavailableCount = services.filter(s => s.is_unavailable).length;
  const totalCount = services.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Minha Disponibilidade</h1>
          <p className="text-sm text-muted-foreground">
            Marque os cultos que voce <strong>nao pode comparecer</strong>. Os demais indicam que voce esta disponivel.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Resumo */}
      {totalCount > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <div className="h-3 w-3 rounded-full bg-[#00B39D]" />
            <span className="text-muted-foreground">{totalCount - unavailableCount} disponivel(is)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-muted-foreground">{unavailableCount} ausencia(s) marcada(s)</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-muted-foreground">Nenhum culto cadastrado para {year}</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Peca para o lider gerar os cultos do ano em "Tipos de Culto"
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {byMonth.map(([monthKey, monthServices]) => {
            const monthDate = parseISO(`${monthKey}-01`);
            return (
              <div key={monthKey}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {format(monthDate, 'MMMM yyyy', { locale: ptBR })}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {monthServices.map(service => {
                    const date = parseISO(service.scheduled_at);
                    const color = serviceColor(service.service_type_name || service.name);
                    const unavailable = service.is_unavailable;
                    const isLoading = toggle.isPending;

                    return (
                      <button
                        key={service.id}
                        onClick={() => handleToggle(service)}
                        disabled={isLoading}
                        title={unavailable ? 'Clique para marcar como disponivel' : 'Clique para marcar ausencia'}
                        className={`
                          flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition-all
                          ${unavailable
                            ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-700 dark:text-red-300 line-through opacity-70'
                            : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                          }
                        `}
                      >
                        {/* Dot colorido do tipo de culto */}
                        <span
                          className="h-2 w-2 rounded-full mb-1"
                          style={{ backgroundColor: unavailable ? '#ef4444' : color }}
                        />
                        <span>{format(date, 'EEE dd', { locale: ptBR })}</span>
                        <span className="text-[10px] opacity-70">{format(date, 'HH:mm')}</span>
                        <span className="text-[10px] max-w-[80px] text-center leading-tight mt-0.5 opacity-80 truncate">
                          {service.service_type_name || service.name}
                        </span>
                        {unavailable && (
                          <span className="text-[9px] text-red-500 mt-0.5 font-bold">ausente</span>
                        )}
                        {!unavailable && (
                          <Check className="h-2.5 w-2.5 text-[#00B39D] mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
