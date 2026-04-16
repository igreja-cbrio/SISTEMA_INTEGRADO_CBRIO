import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarOff, Users } from 'lucide-react';
import { voluntariado } from '@/api';

const TYPE_COLORS: Record<string, string> = {
  'Quarta com Deus': '#6366f1',
  'AMI': '#f59e0b',
  'Bridge': '#ec4899',
  'Domingo 08:30': '#00B39D',
  'Domingo 10:00': '#10b981',
  'Domingo 11:30': '#3b82f6',
  'Domingo 19:00': '#8b5cf6',
};

function typeColor(name: string) {
  return TYPE_COLORS[name] ?? '#00B39D';
}

export default function VolDisponibilidade() {
  const [monthOffset, setMonthOffset] = useState(0);

  const baseDate = new Date(2026, 0, 1); // jan 2026
  const current = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const from = format(startOfMonth(current), 'yyyy-MM-dd');
  const to   = format(endOfMonth(current),   'yyyy-MM-dd');

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['vol', 'services-availability', from, to],
    queryFn: () => voluntariado.availability.byService(from, to) as Promise<{
      id: string; name: string; service_type_name: string;
      scheduled_at: string;
      unavailable: { profile_id: string; name: string; avatar_url: string | null }[];
    }[]>,
  });

  // Agrupa por semana (segunda a domingo) para layout de grade
  const byWeek = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const s of services) {
      const d = parseISO(s.scheduled_at);
      // Chave: inicio da semana (domingo)
      const sunday = new Date(d);
      sunday.setDate(d.getDate() - d.getDay());
      const key = format(sunday, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [services]);

  const totalCultos = services.length;
  const totalAusencias = services.reduce((sum, s) => sum + s.unavailable.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Disponibilidade</h1>
          <p className="text-sm text-muted-foreground">
            Cultos do mes com ausencias registradas pelos voluntarios
          </p>
        </div>
        {/* Navegacao de mes */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            className="h-9 w-9 rounded-md border border-input bg-background flex items-center justify-center hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[130px] text-center capitalize">
            {format(current, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button
            onClick={() => setMonthOffset(o => o + 1)}
            className="h-9 w-9 rounded-md border border-input bg-background flex items-center justify-center hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Resumo */}
      {!isLoading && totalCultos > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{totalCultos} culto(s)</span>
          <span>·</span>
          <span className={totalAusencias > 0 ? 'text-red-500 font-medium' : ''}>
            {totalAusencias} ausencia(s) registrada(s)
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : totalCultos === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-muted-foreground">Nenhum culto neste mes</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Va em "Tipos de Culto" e clique "Gerar 2026 inteiro"
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {byWeek.map(([weekKey, weekServices]) => (
            <div key={weekKey}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Semana de {format(parseISO(weekKey), "dd 'de' MMM", { locale: ptBR })}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {weekServices.map(service => {
                  const date = parseISO(service.scheduled_at);
                  const color = typeColor(service.service_type_name || service.name);
                  const hasUnavail = service.unavailable.length > 0;

                  return (
                    <div
                      key={service.id}
                      className="rounded-lg border bg-card p-3 space-y-2"
                      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium leading-tight">
                            {service.service_type_name || service.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(date, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        {hasUnavail && (
                          <span className="flex items-center gap-1 text-xs bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 rounded-full shrink-0">
                            <Users className="h-3 w-3" />
                            {service.unavailable.length}
                          </span>
                        )}
                      </div>

                      {hasUnavail && (
                        <div className="flex flex-wrap gap-1">
                          {service.unavailable.map(vol => (
                            <span
                              key={vol.profile_id}
                              className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-[10px] px-2 py-0.5 rounded-full"
                            >
                              {vol.avatar_url
                                ? <img src={vol.avatar_url} alt={vol.name} className="h-3.5 w-3.5 rounded-full object-cover" />
                                : <span className="h-3.5 w-3.5 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-[8px] font-bold">{vol.name.charAt(0)}</span>
                              }
                              {vol.name.split(' ')[0]}
                            </span>
                          ))}
                        </div>
                      )}

                      {!hasUnavail && (
                        <p className="text-[10px] text-muted-foreground/50">Todos disponíveis</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
