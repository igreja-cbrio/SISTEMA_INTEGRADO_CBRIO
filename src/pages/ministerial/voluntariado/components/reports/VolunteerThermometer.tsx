import { Badge } from '@/components/ui/badge';

interface ThermometerEntry {
  planningCenterId: string;
  name: string;
  team: string | null;
  scheduled: number;
  checkedIn: number;
  rate: number;
  level: 'very_active' | 'regular' | 'low' | 'inactive';
}

const levelConfig = {
  very_active: { label: 'Muito Ativo', color: '#3b82f6', bgClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  regular: { label: 'Regular', color: '#22c55e', bgClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  low: { label: 'Pouco Ativo', color: '#eab308', bgClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  inactive: { label: 'Inativo', color: '#ef4444', bgClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

// Limite de "servindo demais" por período (nº de serviços efetivos = check-ins).
// Acima disso, risco de sobrecarga — a liderança deve aliviar a escala.
const OVERLOAD_BY_PERIOD: Record<string, number> = { week: 3, month: 8, quarter: 20, semester: 35, year: 60, all: 60 };

export default function VolunteerThermometer({ data, period = 'month' }: { data: ThermometerEntry[]; period?: string }) {
  const sorted = [...data].sort((a, b) => b.rate - a.rate);
  const counts = { very_active: 0, regular: 0, low: 0, inactive: 0 };
  sorted.forEach(v => counts[v.level]++);
  const total = sorted.length;

  // "Servindo demais": ranqueado por serviços efetivos (check-ins) no período.
  const limite = OVERLOAD_BY_PERIOD[period] ?? 8;
  const sobrecarga = [...data]
    .map(v => ({ ...v, servidos: v.checkedIn }))
    .filter(v => v.servidos >= limite)
    .sort((a, b) => b.servidos - a.servidos);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => {
          const cfg = levelConfig[level];
          return (
            <div key={level} className="p-4 rounded-lg border bg-card text-center">
              <div className="h-8 w-8 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ backgroundColor: `${cfg.color}20` }}>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
              </div>
              <p className="text-3xl font-bold">{count}</p>
              <p className="text-sm text-muted-foreground">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Servindo demais (risco de sobrecarga) */}
      <div className="p-3 md:p-4 rounded-lg border bg-card space-y-3" style={{ borderColor: sobrecarga.length ? '#f59e0b66' : undefined }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-semibold text-sm md:text-base flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            Servindo demais
            <span className="text-xs font-normal text-muted-foreground">· risco de sobrecarga</span>
          </h4>
          <span className="text-xs text-muted-foreground">{sobrecarga.length} acima de {limite} no período</span>
        </div>
        {sobrecarga.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Ninguém servindo acima do limite ({limite}) no período. 👍</p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {sobrecarga.map(v => (
              <div key={v.planningCenterId} className="flex items-center gap-2 md:gap-3 p-2.5 rounded-lg border bg-amber-50/60 dark:bg-amber-950/20 min-h-[48px]">
                <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0 text-[10px] md:text-xs">
                  {v.servidos} serviços
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs md:text-sm truncate">{v.name}</p>
                  {v.team && <p className="text-[10px] md:text-xs text-muted-foreground truncate">{v.team}</p>}
                </div>
                <span className="text-[10px] md:text-xs text-muted-foreground shrink-0">{v.checkedIn}/{v.scheduled} presença</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribution bar */}
      {total > 0 && (
        <div className="p-4 rounded-lg border bg-card space-y-3">
          <h4 className="font-semibold">Distribuição</h4>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => {
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={level}
                  style={{ width: `${pct}%`, backgroundColor: levelConfig[level].color }}
                  className="transition-all"
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 justify-center text-sm">
            {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => (
              <div key={level} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: levelConfig[level].color }} />
                <span className="text-muted-foreground">{levelConfig[level].label}: {count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Volunteer list */}
      <div className="p-3 md:p-4 rounded-lg border bg-card space-y-3">
        <h4 className="font-semibold text-sm md:text-base">Voluntarios ({total})</h4>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {sorted.map(v => {
            const cfg = levelConfig[v.level];
            const pct = v.scheduled > 0 ? Math.round((v.checkedIn / v.scheduled) * 100) : 0;
            return (
              <div key={v.planningCenterId} className="flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border bg-card hover:bg-muted/30 min-h-[52px]">
                <Badge variant="outline" className={`${cfg.bgClass} shrink-0 text-[10px] md:text-xs`}>
                  {cfg.label}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs md:text-sm truncate">{v.name}</p>
                  {v.team && <p className="text-[10px] md:text-xs text-muted-foreground truncate">{v.team}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 md:w-24 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full rounded-full transition-all cbrio-bar"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cfg.color }}
                    />
                  </div>
                  <span className="text-[10px] md:text-xs text-muted-foreground text-right">
                    {v.checkedIn}/{v.scheduled}
                  </span>
                </div>
              </div>
            );
          })}
          {total === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum voluntário encontrado no período</p>
          )}
        </div>
      </div>
    </div>
  );
}
